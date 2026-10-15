#!/usr/bin/env python3
"""Test unitario de tools/catalog/build_catalog.py (SPEC 21 F2).

Ejecutable sin red y sin dependencias externas:

    python3 tools/catalog/test_build_catalog.py
    # o: pytest tools/catalog/test_build_catalog.py

Ejercita las ramas ciqual/usda/own y los errores esperados usando XML y JSON
temporales en /tmp (los XML imitan el formato Ciqual 2020 recortado).
"""

from __future__ import annotations

import re
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
<COMPO><alim_code>7001</alim_code><const_code>25000</const_code><teneur>8,5</teneur></COMPO>
<COMPO><alim_code>7001</alim_code><const_code>40000</const_code><teneur>4,2</teneur></COMPO>
<COMPO><alim_code>7001</alim_code><const_code>328</const_code><teneur>180</teneur></COMPO>
<COMPO><alim_code>7001</alim_code><const_code>34100</const_code><teneur>2,7</teneur></COMPO>
<COMPO><alim_code>7001</alim_code><const_code>32000</const_code><teneur>3,1</teneur></COMPO>
<COMPO><alim_code>11000</alim_code><const_code>25000</const_code><teneur>6</teneur></COMPO>
<COMPO><alim_code>11000</alim_code><const_code>40000</const_code><teneur>0,5</teneur></COMPO>
<COMPO><alim_code>20047</alim_code><const_code>25000</const_code><teneur>0,9</teneur></COMPO>
<COMPO><alim_code>20047</alim_code><const_code>40000</const_code><teneur>0,2</teneur></COMPO>
<COMPO><alim_code>20047</alim_code><const_code>328</const_code><teneur>18</teneur></COMPO>
<COMPO><alim_code>20047</alim_code><const_code>34100</const_code><teneur>1,2</teneur></COMPO>
<COMPO><alim_code>20047</alim_code><const_code>32000</const_code><teneur>2,6</teneur></COMPO>
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
        self.macros = bc.load_macros(self.xml_dir)
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

    def test_carga_macros_ciqual(self) -> None:
        self.assertEqual(
            sorted(self.macros),
            ["fatPer100g", "fiberPer100g", "kcalPer100g", "proteinPer100g", "sugarsPer100g"],
        )
        self.assertEqual(self.macros["proteinPer100g"]["7001"], 8.5)
        self.assertEqual(self.macros["fatPer100g"]["7001"], 4.2)
        self.assertEqual(self.macros["kcalPer100g"]["7001"], 180.0)
        self.assertEqual(self.macros["fiberPer100g"]["7001"], 2.7)
        self.assertEqual(self.macros["sugarsPer100g"]["7001"], 3.1)
        self.assertIn("20047", self.macros["kcalPer100g"])
        self.assertNotIn("11000", self.macros["kcalPer100g"])  # el ajo no trae 328
        self.assertNotIn("11000", self.macros["fiberPer100g"])  # ni fibra

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
        entry = bc.build([self.row()], self.carbs, self.macros, self.names, {}, {})[0]
        self.assertEqual(entry["carbs"], 49.4)
        self.assertTrue(entry["source"].startswith("Ciqual 2020 #7001"))
        self.assertNotIn("range", entry)

    def test_ciqual_code_con_espacios(self) -> None:
        entry = bc.build([self.row(code="  7001  ")], self.carbs, self.macros, self.names, {}, {})[0]
        self.assertEqual(entry["carbs"], 49.4)

    def test_ciqual_code_ausente(self) -> None:
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(code="9999")], self.carbs, self.macros, self.names, {}, {})
        self.assertIn("Ciqual no tiene carbohidratos", str(cm.exception))

    def test_ciqual_kcal_de_fuente_sin_marcar(self) -> None:
        entry = bc.build([self.row()], self.carbs, self.macros, self.names, {}, {})[0]
        self.assertEqual(entry["proteinPer100g"], 8.5)
        self.assertEqual(entry["fatPer100g"], 4.2)
        self.assertEqual(entry["kcalPer100g"], 180.0)  # 328 de la fuente
        self.assertNotIn("kcalDerived", entry)
        self.assertEqual(entry["fiberPer100g"], 2.7)
        self.assertEqual(entry["sugarsPer100g"], 3.1)

    def test_ciqual_sin_328_deriva_kcal_y_omite_fibra_azucares(self) -> None:
        entry = bc.build([self.row(id="ajo", code="11000")], self.carbs, self.macros, self.names, {}, {})[0]
        self.assertEqual(entry["carbs"], 25.0)
        self.assertEqual(entry["proteinPer100g"], 6.0)
        self.assertEqual(entry["fatPer100g"], 0.5)
        self.assertEqual(entry["kcalPer100g"], 128.5)  # 4*6 + 4*25 + 9*0.5
        self.assertTrue(entry["kcalDerived"])
        self.assertNotIn("fiberPer100g", entry)
        self.assertNotIn("sugarsPer100g", entry)

    # --- rama usda -------------------------------------------------------
    def test_usda_presente(self) -> None:
        usda = {"1234": {"carbs": 8.4, "name": "Stew, beef"}}
        entry = bc.build([self.row(id="marmitako", code="1234", source="usda")], {}, {}, {}, usda, {})[0]
        self.assertEqual(entry["carbs"], 8.4)
        self.assertEqual(entry["source"], "USDA FDC #1234 - Stew, beef")

    def test_usda_ausente(self) -> None:
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(id="marmitako", code="9999", source="usda")], {}, {}, {}, {}, {})
        self.assertIn("usda.json no tiene fdcId 9999", str(cm.exception))

    def test_usda_macros_presentes(self) -> None:
        usda = {
            "1234": {
                "carbs": 8.4,
                "name": "Stew, beef",
                "protein": 3.0,
                "fat": 1.0,
                "kcal": 50,
                "fiber": 2.0,
                "sugars": 1.0,
            }
        }
        entry = bc.build([self.row(id="m", code="1234", source="usda")], {}, {}, {}, usda, {})[0]
        self.assertEqual(entry["proteinPer100g"], 3.0)
        self.assertEqual(entry["fatPer100g"], 1.0)
        self.assertEqual(entry["kcalPer100g"], 50.0)
        self.assertEqual(entry["fiberPer100g"], 2.0)
        self.assertEqual(entry["sugarsPer100g"], 1.0)
        self.assertNotIn("kcalDerived", entry)

    def test_usda_acepta_claves_per100g(self) -> None:
        usda = {
            "9": {
                "carbsPer100g": 5.0,
                "description": "X",
                "proteinPer100g": 2.0,
                "fatPer100g": 1.5,
                "kcalPer100g": 40.0,
            }
        }
        entry = bc.build([self.row(id="m", code="9", source="usda")], {}, {}, {}, usda, {})[0]
        self.assertEqual(entry["proteinPer100g"], 2.0)
        self.assertEqual(entry["fatPer100g"], 1.5)
        self.assertEqual(entry["kcalPer100g"], 40.0)

    def test_usda_sin_macros_los_omite(self) -> None:
        usda = {"1234": {"carbs": 8.4, "name": "Stew, beef"}}
        entry = bc.build([self.row(id="m", code="1234", source="usda")], {}, {}, {}, usda, {})[0]
        for key in ("proteinPer100g", "fatPer100g", "kcalPer100g", "fiberPer100g", "sugarsPer100g"):
            self.assertNotIn(key, entry)

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
        entries = bc.build(rows, self.carbs, self.macros, self.names, {}, recipes)
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

    def test_own_deriva_macros_y_kcal(self) -> None:
        recipes = {"salmorejo": self._own_recipe()}
        rows = self.ingredients() + [
            self.row(id="salmorejo", es="Salmorejo", en="Salmorejo", portion="250",
                     code="salmorejo", source="own")
        ]
        own = bc.build(rows, self.carbs, self.macros, self.names, {}, recipes)[-1]
        # protein: 50*8.5/100 + 50*6/100 = 7.25 ; fat: 50*4.2/100 + 50*0.5/100 = 2.35
        # fiber: solo el pan -> 50*2.7/100 = 1.35 ; sugars: 50*3.1/100 = 1.55
        self.assertEqual(own["proteinPer100g"], 7.25)
        self.assertEqual(own["fatPer100g"], 2.35)
        self.assertEqual(own["fiberPer100g"], 1.35)
        self.assertEqual(own["sugarsPer100g"], 1.55)
        # kcal = 4*7.25 + 4*37.2 + 9*2.35 = 198.95 (derivada)
        self.assertEqual(own["kcalPer100g"], 198.95)
        self.assertTrue(own["kcalDerived"])
        self.assertEqual(own["carbs"], 37.2)

    def test_own_omite_macros_sin_ingrediente(self) -> None:
        # Un unico ingrediente sin fibra ni azucares (ajo): esos macros se omiten.
        recipes = {"p": self._own_recipe(ingredients=[{"id": "ajo", "grams": 100}])}
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        own = bc.build(rows, self.carbs, self.macros, self.names, {}, recipes)[-1]
        self.assertEqual(own["proteinPer100g"], 6.0)
        self.assertEqual(own["fatPer100g"], 0.5)
        self.assertEqual(own["kcalPer100g"], 128.5)
        self.assertNotIn("fiberPer100g", own)
        self.assertNotIn("sugarsPer100g", own)

    def test_own_sin_yield_usa_suma_de_gramos(self) -> None:
        recipes = {
            "p": self._own_recipe(
                yieldGrams=None,
                ingredients=[{"id": "pan_blanco", "grams": 50}, {"id": "ajo", "grams": 150}],
            )
        }
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        own = bc.build(rows, self.carbs, self.macros, self.names, {}, recipes)[-1]
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
        own = bc.build(rows, self.carbs, self.macros, self.names, {}, recipes)[-1]
        self.assertEqual(own["carbs"], 37.2)

    def test_own_uncertainty_cero_lo_es_igual_a_hi(self) -> None:
        recipes = {"p": self._own_recipe(uncertainty=0.0)}
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        own = bc.build(rows, self.carbs, self.macros, self.names, {}, recipes)[-1]
        lo, hi = own["range"]
        self.assertEqual(lo, hi)
        self.assertEqual(lo, 37.2)
        self.assertEqual(own["carbs"], 37.2)

    def test_own_uncertainty_por_defecto(self) -> None:
        recipe = self._own_recipe()
        del recipe["uncertainty"]
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        own = bc.build(rows, self.carbs, self.macros, self.names, {}, {"p": recipe})[-1]
        lo, hi = own["range"]
        self.assertEqual(lo, round(37.2 * (1 - bc.DEFAULT_UNCERTAINTY), 2))
        self.assertEqual(hi, round(37.2 * (1 + bc.DEFAULT_UNCERTAINTY), 2))

    def test_own_sin_receta(self) -> None:
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(id="ghost", code="ghost", source="own")], self.carbs, self.macros, self.names, {}, {})
        self.assertIn("no tiene la receta ghost", str(cm.exception))

    def test_own_ingrediente_inexistente(self) -> None:
        recipes = {"p": self._own_recipe(ingredients=[{"id": "nope", "grams": 10}])}
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(id="p", code="p", source="own")], self.carbs, self.macros, self.names, {}, recipes)
        self.assertIn("no existe en el catalogo", str(cm.exception))

    def test_own_ingrediente_que_es_own(self) -> None:
        recipes = {
            "plato": self._own_recipe(ingredients=[{"id": "otro", "grams": 10}]),
            "otro": self._own_recipe(),
        }
        rows = [self.row(id="plato", code="plato", source="own"), self.row(id="otro", code="otro", source="own")]
        with self.assertRaises(SystemExit) as cm:
            bc.build(rows, self.carbs, self.macros, self.names, {}, recipes)
        self.assertIn("es un plato own", str(cm.exception))

    # --- errores y validaciones -----------------------------------------
    def test_source_invalido(self) -> None:
        with self.assertRaises(SystemExit) as cm:
            bc.build([self.row(source="foo")], self.carbs, self.macros, self.names, {}, {})
        self.assertIn("source desconocido 'foo'", str(cm.exception))

    def test_ids_duplicados_entre_fuentes(self) -> None:
        rows = [self.row(), self.row()]
        with self.assertRaises(SystemExit) as cm:
            bc.build(rows, self.carbs, self.macros, self.names, {}, {})
        self.assertIn("Ids duplicados", str(cm.exception))

    # --- render ----------------------------------------------------------
    def test_render_anade_carbsrange_solo_en_own(self) -> None:
        recipes = {"p": self._own_recipe()}
        rows = self.ingredients() + [self.row(id="p", code="p", source="own")]
        entries = bc.build(rows, self.carbs, self.macros, self.names, {}, recipes)
        text = bc.render(entries)
        self.assertIn("carbsRange: [", text)
        self.assertEqual(text.count("carbsRange: ["), 1)
        # carbsRange va justo tras carbsPer100g
        self.assertRegex(text, r"carbsPer100g: [0-9.]+,?\n\s*carbsRange: \[[0-9.]+, [0-9.]+\],")

    def test_render_sin_own_no_emite_carbsrange(self) -> None:
        entries = bc.build([self.row()], self.carbs, self.macros, self.names, {}, {})
        self.assertNotIn("carbsRange", bc.render(entries))

    def test_render_emite_macros_de_fuente(self) -> None:
        entries = bc.build([self.row()], self.carbs, self.macros, self.names, {}, {})
        text = bc.render(entries)
        self.assertIn("proteinPer100g: 8.5,", text)
        self.assertIn("fatPer100g: 4.2,", text)
        self.assertIn("kcalPer100g: 180.0,", text)
        self.assertIn("fiberPer100g: 2.7,", text)
        self.assertIn("sugarsPer100g: 3.1,", text)
        self.assertNotIn("kcalDerived", text)
        # Los macros van tras carbsPer100g y antes de defaultPortionGrams.
        self.assertRegex(text, r"(?s)carbsPer100g: [0-9.]+,.*proteinPer100g: .*defaultPortionGrams:")

    def test_render_marca_kcal_derivada(self) -> None:
        entries = bc.build([self.row(id="ajo", code="11000")], self.carbs, self.macros, self.names, {}, {})
        text = bc.render(entries)
        self.assertIn("kcalPer100g: 128.5,", text)
        self.assertIn("kcalDerived: true,", text)
        self.assertNotIn("fiberPer100g", text)

    # --- ficheros reales del repo (integracion ligera) -------------------
    def test_ficheros_del_repo_cargan(self) -> None:
        usda = bc.load_usda(REPO / "tools/catalog/usda.json")
        self.assertEqual(usda, {})
        recipes = bc.load_recipes(REPO / "tools/catalog/recipes.json")
        self.assertEqual(len(recipes), 14)
        self.assertIn("salmorejo", recipes)
        self.assertIn("canelones", recipes)
        self.assertIn("fabada", recipes)

    def test_catalogo_commiteado_cubre_macros(self) -> None:
        # Integracion sobre el catalog.ts generado y commiteado (no requiere el XML).
        catalog = (REPO / "src/catalog/catalog.ts").read_text(encoding="utf-8")
        entries = re.findall(r"\n    \{", catalog)
        self.assertEqual(len(entries), 186)
        self.assertEqual(catalog.count("proteinPer100g:"), 186)
        self.assertEqual(catalog.count("fatPer100g:"), 186)
        self.assertGreater(catalog.count("kcalDerived: true"), 0)
        types = (REPO / "src/catalog/types.ts").read_text(encoding="utf-8")
        self.assertIn("CATALOG_VERSION = 2", types)


if __name__ == "__main__":
    unittest.main(verbosity=2)
