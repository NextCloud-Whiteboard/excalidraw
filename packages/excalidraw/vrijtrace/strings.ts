/** Vrij Tracé UI text — Dutch, wording of the frozen v8.2 prototype. */
export const STR = {
  tool: "Vrij Tracé",
  onlyOnPdf: "Sleuven teken je alleen op een geïmporteerde PDF-pagina",
  calibrateFirst: "Kalibreer eerst de liniaal op deze pagina",
  notActivated: "Zones niet geactiveerd",
  conceptZones: "Zones niet geactiveerd · concept",
  concept: "CONCEPT · NIET GEACTIVEERD",
  heldBy: (name: string) => `${name} bewerkt dit punt`,
  editing: (name: string) => `${name} bewerkt`,
  unknownUser: "Onbekend",
  sections: {
    snap: "1. Magnetisch uitlijnen",
    trench: "2. Sleufinstellingen",
    red: "3. Schadepreventiezone",
    work: "4. Werkruimte",
    trees: "5. Bomen en afstandscontrole",
  },
  help: {
    draw: "Teken een sleuf uit de vrije hand. Bij 90° of 45° wordt de lijn bij het loslaten rechtgetrokken.",
    width: "Van 0,30 tot 10,00 m.",
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
    treeMin: "Minimale afstand vanaf ring",
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
  table: {
    title: "Boomcontrole",
    number: "#",
    tree: "Boom",
    inTrench: "In sleuf",
    distance: "Afstand vanaf ring",
    min: "Min. eis",
    verdict: "Toets",
    red: "Rode zone",
    work: "Werkruimte",
    ok: "Voldoet",
    conflict: "Conflict",
    yes: "Ja",
    no: "Nee",
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
