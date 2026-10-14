#!/usr/bin/env python3
"""Test unitario de tools/catalog/build_catalog.py (SPEC 21 F2).

Ejecutable sin red y sin dependencias externas:

    python3 tools/catalog/test_build_catalog.py
    # o: pytest tools/catalog/test_build_catalog.py

Ejercita las ramas ciqual/usda/own y los errores esperados usando XML y JSON
temporales en /tmp (los XML imitan el formato Ciqual 2020 recortado).
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_catalog as bc  # noqa: E402

REPO = Path(__file__).resolve().parents[2]

XML_ALIM = """<?xml version="1.0" encoding="utf-8"?>
<ALIM><alim_code>7001</alim_code><alim_nom_eng>Bread, French bread, baguette</alim_nom_eng></ALIM>
<ALIM><alim_code>11000</alim_code><alim_nom_eng>Garlic, fresh</alim_nom_eng></ALIM>
<ALIM><alim_code>20047</alim_code><alim_nom_eng>Tomato, raw</alim_nom_eng></ALIM>
"""

XML_COMPO = """<?xml version="1.0" encoding="utf-8"?>
<COMPO><alim_code>7001</alim_code><const_code>31000</const_code><teneur>49,4</teneur></COMPO>
<COMPO><alim_code>11000</alim_code><const_code>31000</const_code><teneur>25</teneur></COMPO>
<COMPO><alim_code>20047</alim_code><const_code>31000</const_code><teneur>3,9</teneur></COMPO>
<COMPO><alim_code>7001</alim_code><const_code>9999</const_code><teneur>1,1</teneur></COMPO>
"""


class BuildCatalogTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(dir=tempfile.gettempdir())
        self.tmp = Path(self._tmp.name)
        self.xml_dir = self.tmp / "xml"
        self.xml_dir.mkdir()
        (self.xml_dir / "alim_2020_07_07.xml").write_text(XML_ALIM, encoding="utf-8")
        (self.xml_dir / "compo_2020_07_07.xml").write_text(XML_COMPO, encoding="utf-8")
        self.carbs = bc.load_carbs(self.xml_dir)
        self.names = bc.load_names(self.xml_dir)
        # pan_blanco=49.4, ajo=25.0, tomate=3.9 (g/100g)
        self.assertTrue(str(self.tmp).startswith(tempfile.gettempdir()))

    def tearDown(self) -> None:
        self._tmp.cleanup()

    # --- helpers ---------------------------------------------------------
    def row(self, **overrides) -> dict:
        base = {
            "id": "pan_blanco",
            "es": "Pan blanco",
            "en": "White bread",
            "synonyms": "pan|barra",
            "portion": "60",
            "code": "7001",
        }
        base.update(overrides)
        return base

    def ingredients(self) -> list[dict]:
        return [
            self.row(),
            self.row(id="ajo", es="Ajo", en="Garlic", synonyms="ajo", portion="5", code="11000"),
        ]

    # --- carga de XML/JSON en /tmp --------------------------------------
    def test_carga_xml_ciqual(self) -> None:
        self.assertEqual(self.carbs["7001"], 49.4)
        self.assertEqual(self.carbs["11000"], 25.0)
        self.assertNotIn("9999", self.carbs)  # solo const_code 31000
        self.assertEqual(self.names["7001"], "Bread, French bread, baguette")

    def test_carga_json_planos_y_envueltos(self) -> None:
        usda_flat = self.tmp / "usda_flat.json"
        usda_flat.write_text('{"1234": {"carbs": 8.4, "name": "Stew, beef"}}', encoding="utf-8")
        self.assertEqual(bc.load_usda(usda_flat)["1234"]["carbs"], 8.4)

        usda_wrapped = self.tmp / "usda_wrapped.json"
        usda_wrapped.write_text(
            '{"foods": {"77": {"carbsPer100g": 2.0, "description": "X"}}}', encoding="utf-8"
        )
        self.assertEqual(bc.load_usda(usda_wrapped)["77"]["carbsPer100g"], 2.0)

        rec_flat = self.tmp / "recipes_flat.json"
        rec_flat.write_text('{"plato": {"ingredients": [{"id": "ajo", "grams": 1}]}}', encoding="utf-8")
        self.assertIn("plato", bc.load_recipes(rec_flat))

        rec_wrapped = self.tmp / "recipes_wrapped.json"
        rec_wrapped.write_text('{"recipes": {"p2": {}}}', encoding="utf-8")
        self.assertIn("p2", bc.load_recipes(rec_wrapped))

        with self.assertRaises(SystemExit):
            bc.load_usda(self.tmp / "no_existe.json")

    # --- source_of -------------------------------------------------------
    def test_source_por_defecto_es_ciqual(self) -> None:
        self.assertEqual(bc.source_of(self.row()), "ciqual")  # sin columna
        self.assertEqual(bc.source_of(self.row(source="")), "ciqual")
        self.assertEqual(bc.source_of(self.row(source="   ")), "ciqual")
        self.assertEqual(bc.source_of(self.row(source=" USDA ")), "usda")
        self.assertEqual(bc.source_of(self.row(source="Own")), "own")

    # --- rama ciqual -----------------------------------------------------
    def test_ciqual_sin_columna_source(self) -> None:
        entry = bc.build([self.row()], self.carbs, self.names, {}, {})[0]
        self.assertEqual(entry["carbs"], 49.4)
        self.assertTrue(entry["source"].startswith("Ciqual 2020 #7001"))
        self.assertNotIn("range", entry)

    def test_ciqual_code_con_espacios(self) -> None:
        entry = bc.build([self.row(code="  7001  ")], self.carbs, self.names, {}, {})[0]
        self.assertEqual(entry["carbs"], 49.4)

    def test_ciqual_code_ausente(self) -> None:
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(code="9999")], self.carbs, self.names, {}, {})
        self.assertIn("Ciqual no tiene carbohidratos", str(cm.exception))

    # --- rama usda -------------------------------------------------------
    def test_usda_presente(self) -> None:
        usda = {"1234": {"carbs": 8.4, "name": "Stew, beef"}}
        entry = bc.build([self.row(id="marmitako", code="1234", source="usda")], {}, {}, usda, {})[0]
        self.assertEqual(entry["carbs"], 8.4)
        self.assertEqual(entry["source"], "USDA FDC #1234 - Stew, beef")

    def test_usda_ausente(self) -> None:
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(id="marmitako", code="9999", source="usda")], {}, {}, {}, {})
        self.assertIn("usda.json no tiene fdcId 9999", str(cm.exception))

    # --- rama own --------------------------------------------------------
    def _own_recipe(self, **overrides) -> dict:
        recipe = {
            "title": "Salmorejo",
            "yieldGrams": 100,
            "uncertainty": 0.2,
            "ingredients": [
                {"id": "pan_blanco", "grams": 50},
                {"id": "ajo", "grams": 50},
            ],
        }
        recipe.update(overrides)
        return recipe

    def test_own_normal_deriva_carbs_y_rango(self) -> None:
        recipes = {"salmorejo": self._own_recipe()}
        rows = self.ingredients() + [
            self.row(id="salmorejo", es="Salmorejo", en="Salmorejo", synonyms="salmorejo cordobes",
                     portion="250", code="salmorejo", source="own")
        ]
        entries = bc.build(rows, self.carbs, self.names, {}, recipes)
        self.assertEqual([e["id"] for e in entries], ["pan_blanco", "ajo", "salmorejo"])
        own = entries[-1]
        # total = 50*49.4/100 + 50*25/100 = 37.2 -> per100 = 37.2
        self.assertEqual(own["carbs"], 37.2)
        lo, hi = own["range"]
        self.assertEqual(lo, 29.76)
        self.assertEqual(hi, 44.64)
        self.assertLessEqual(lo, hi)
        self.assertTrue(own["source"].startswith("Receta propia #salmorejo"))
        self.assertIn("pan_blanco", own["source"])
        self.assertIn("ajo", own["source"])

    def test_own_sin_yield_usa_suma_de_gramos(self) -> None:
        recipes = {
            "p": self._own_recipe(
                yieldGrams=None,
                ingredients=[{"id": "pan_blanco", "grams": 50}, {"id": "ajo", "grams": 150}],
            )
        }
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        own = bc.build(rows, self.carbs, self.names, {}, recipes)[-1]
        # total = 50*0.494 + 150*0.25 = 24.7 + 37.5 = 62.2; yield = 200 -> 31.1
        self.assertEqual(own["carbs"], 31.1)

    def test_own_yield_cero_usa_suma_de_gramos(self) -> None:
        recipes = {
            "p": self._own_recipe(
                yieldGrams=0,
                ingredients=[{"id": "pan_blanco", "grams": 50}, {"id": "ajo", "grams": 50}],
            )
        }
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        own = bc.build(rows, self.carbs, self.names, {}, recipes)[-1]
        self.assertEqual(own["carbs"], 37.2)

    def test_own_uncertainty_cero_lo_es_igual_a_hi(self) -> None:
        recipes = {"p": self._own_recipe(uncertainty=0.0)}
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        own = bc.build(rows, self.carbs, self.names, {}, recipes)[-1]
        lo, hi = own["range"]
        self.assertEqual(lo, hi)
        self.assertEqual(lo, 37.2)
        self.assertEqual(own["carbs"], 37.2)

    def test_own_uncertainty_por_defecto(self) -> None:
        recipe = self._own_recipe()
        del recipe["uncertainty"]
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        own = bc.build(rows, self.carbs, self.names, {}, {"p": recipe})[-1]
        lo, hi = own["range"]
        self.assertEqual(lo, round(37.2 * (1 - bc.DEFAULT_UNCERTAINTY), 2))
        self.assertEqual(hi, round(37.2 * (1 + bc.DEFAULT_UNCERTAINTY), 2))

    def test_own_sin_receta(self) -> None:
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(id="ghost", code="ghost", source="own")], self.carbs, self.names, {}, {})
        self.assertIn("no tiene la receta ghost", str(cm.exception))

    def test_own_ingrediente_inexistente(self) -> None:
        recipes = {"p": self._own_recipe(ingredients=[{"id": "nope", "grams": 10}])}
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(id="p", code="p", source="own")], self.carbs, self.names, {}, recipes)
        self.assertIn("no existe en el catalogo", str(cm.exception))

    def test_own_ingrediente_que_es_own(self) -> None:
        recipes = {
            "plato": self._own_recipe(ingredients=[{"id": "otro", "grams": 10}]),
            "otro": self._own_recipe(),
        }
        rows = [self.row(id="plato", code="plato", source="own"), self.row(id="otro", code="otro", source="own")]
        with self.assertRaises(SystemExit) as cm:
            bc.build(rows, self.carbs, self.names, {}, recipes)
        self.assertIn("es un plato own", str(cm.exception))

    # --- errores y validaciones -----------------------------------------
    def test_source_invalido(self) -> None:
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(source="foo")], self.carbs, self.names, {}, {})
        self.assertIn("source desconocido 'foo'", str(cm.exception))

    def test_ids_duplicados_entre_fuentes(self) -> None:
        rows = [self.row(), self.row()]
        with self.assertRaises(SystemExit) as cm:
            bc.build(rows, self.carbs, self.names, {}, {})
        self.assertIn("Ids duplicados", str(cm.exception))

    # --- render ----------------------------------------------------------
    def test_render_anade_carbsrange_solo_en_own(self) -> None:
        recipes = {"p": self._own_recipe()}
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        entries = bc.build(rows, self.carbs, self.names, {}, recipes)
        text = bc.render(entries)
        self.assertIn("carbsRange: [", text)
        self.assertEqual(text.count("carbsRange: ["), 1)
        # carbsRange va justo tras carbsPer100g
        self.assertRegex(text, r"carbsPer100g: [0-9.]+,?\n\s*carbsRange: \[[0-9.]+, [0-9.]+\],")

    def test_render_sin_own_no_emite_carbsrange(self) -> None:
        entries = bc.build([self.row()], self.carbs, self.names, {}, {})
        self.assertNotIn("carbsRange", bc.render(entries))

    # --- ficheros reales del repo (integracion ligera) -------------------
    def test_ficheros_del_repo_cargan(self) -> None:
        usda = bc.load_usda(REPO / "tools/catalog/usda.json")
        self.assertEqual(usda, {})
        recipes = bc.load_recipes(REPO / "tools/catalog/recipes.json")
        self.assertEqual(len(recipes), 14)
        self.assertIn("salmorejo", recipes)
        self.assertIn("canelones", recipes)
        self.assertIn("fabada", recipes)


if __name__ == "__main__":
    unittest.main(verbosity=2)
