/** Vrij Tracé UI text — Dutch, wording of the frozen v8.2 prototype. */
export const STR = {
  tool: "Vrij Tracé",
  onlyOnPdf: "Sleuven teken je alleen op een geïmporteerde PDF-pagina",
  /** why Liniaal and Vrij Tracé are greyed out */
  importPdfFirst: "Importeer eerst een PDF",
  selectPdfFirst: "Selecteer eerst een geïmporteerde PDF-pagina",
  /** a ruler line started off every PDF page */
  rulerOnlyOnPdf: "Meet met de liniaal alleen op een geïmporteerde PDF-pagina",
  calibrateFirst: "Kalibreer eerst de liniaal op deze pagina",
  notActivated: "Zones niet geactiveerd",
  conceptZones: "Zones niet geactiveerd · concept",
  concept: "CONCEPT · NIET GEACTIVEERD",
  heldBy: (name: string) => `${name} bewerkt dit punt`,
  editing: (name: string) => `${name} bewerkt`,
  /** on the drawing, for a selected tree the trench reaches */
  treeInRing: "in ring",
  treeInTrench: "in sleuf",
  unknownUser: "Onbekend",
  /** the second bar under the toolbar, numbered as the old panel's sections */
  bar: {
    snap: "1 Uitlijnen",
    trench: "2 Sleuf",
    red: "3 Schadepreventie",
    work: "4 Werkruimte",
    max: "max.",
  },
  help: {
    draw: "Teken een sleuf uit de vrije hand. Bij 90° of 45° wordt de lijn bij het loslaten rechtgetrokken.",
    red: "Onafhankelijke rode zone vanaf de buitenzijde van de sleuf.",
    trees:
      "Plaats bomen uit de bibliotheek (groep Bomen) op de PDF-pagina. De afstand wordt gemeten vanaf de buitenste ring van de boom.",
  },
  labels: {
    width: "Sleufbreedte",
    reference: "Tekenreferentie",
    middle: "Middenlijn",
    left: "Linker rand",
    right: "Rechter rand",
    top: "Bovenrand",
    bottom: "Onderrand",
    lineWidth: "Lijndikte",
    redDistance: "Afstand buiten sleufrand",
    side: "Zijde",
    workWidth: "Breedte buiten sleufrand",
    both: "Beide zijden",
    sideTop: "Boven",
    sideBottom: "Onder",
    sideLeft: "Links",
    sideRight: "Rechts",
  },
  applies: {
    next: "Geen sleuf geselecteerd: instellingen voor de volgende sleuf.",
    selected: (n: number) =>
      n === 1
        ? "Wijzigingen gelden voor de geselecteerde sleuf."
        : `Wijzigingen gelden voor de ${n} geselecteerde sleuven.`,
  },
  actions: {
    activate: "Activeer zones",
    deactivate: "Deactiveer zones",
  },
  /** the right-hand overview: everything about the page at a glance */
  summary: {
    trees: "bomen",
    ok: "voldoen",
    conflict: "conflict",
    settings: "Sleufinstellingen",
    snap: "Uitlijnen",
    red: "Schadepreventiezone",
    work: "Werkruimte",
    redValue: (side: string) => `2,00 m · ${side}`,
    workValue: (m: string, side: string) => `${m} m · ${side}`,
  },
  table: {
    title: "Boomcontrole",
    number: "#",
    tree: "Boom",
    distance: "Afstand ring",
    verdict: "Toets",
    zones: "Zones",
    ok: "Voldoet",
    conflict: "Conflict",
    yes: "ja",
    no: "nee",
    inTrench: "in sleuf",
    red: "schadepreventie",
    work: "werkruimte",
  },
  legend: {
    trench: "Sleuf",
    red: "Schadepreventie",
    work: "Werkruimte",
    overlap: "Overlap",
  },
  count: (segments: number, nodes: number) =>
    `${segments} segmenten · ${nodes} knooppunten`,
  scale: (page: string, pxPerM: string) => `${page}: 1 m = ${pxPerM} px`,
  activatedBy: (name: string, time: string) =>
    `Zones geactiveerd · door ${name}, ${time}`,
  noPage: "Klik met Vrij Tracé op een geïmporteerde PDF-pagina om te beginnen.",
  disclaimer:
    "Functionele demonstratie. Afstanden en zone-unies zijn schematisch berekend. De tekening is niet maatvoerend gevalideerd voor CAD, landmeetkunde, engineering of formele toetsing.",
} as const;
