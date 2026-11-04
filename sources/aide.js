/* =====================================================================
   TEXTES DE L'AIDE — modifiables librement (garder guillemets et virgules)
   - latence      : la fenêtre montrée une seule fois, à la toute première ouverture.
   - rappelLatence: la ligne ajoutée à « Avant de jouer » (séance) tant que la
                    latence n'a pas été mesurée sur cet appareil.
   - etiquettes   : les étiquettes du bouton « ? ». Pour chacune :
       cibles : l'élément de l'écran visé (le premier visible est utilisé),
       nom    : le texte court de l'étiquette,
       texte  : l'explication affichée quand on touche l'étiquette (<b>, <i>, <br> permis).
   ===================================================================== */
const AIDE = {
  latence: {
    titre: "Réglez la latence",
    texte: "Avec une enceinte ou un casque Bluetooth, le son arrive en retard sur la partition. Mesurez ce retard <b>une fois par appareil de sortie</b> : volume assez fort, téléphone près de l'enceinte, dans le calme. L'application émet quelques bips et s'ajuste toute seule.",
    plusTard: "Ce réglage reste accessible à tout moment dans <b>Paramètres</b> (roue dentée) › Son › <b>Mesurer</b>.",
    bouton: "Mesurer maintenant",
    fermer: "Plus tard"
  },

  rappelLatence: {
    titre: "Pensez à régler la latence",
    texte: "La latence n'a pas encore été mesurée sur cet appareil. Si vous jouez avec le son de ce téléphone (enceinte, casque), mesurez-la maintenant : c'est 10 secondes.",
    bouton: "Mesurer maintenant"
  },

  etiquettes: [
    /* ---- liste des morceaux ---- */
    { cibles: ["#songSearch"], nom: "Rechercher",
      texte: "Tapez quelques lettres du titre pour filtrer la liste." },
    { cibles: ["#songs .song"], nom: "Ouvrir un morceau",
      texte: "Touchez un morceau pour l'ouvrir. Votre partie est retenue d'une fois sur l'autre." },
    { cibles: ["#localBtn"], nom: "Fichier",
      texte: "Ouvre une partition MusicXML (.mxl, .musicxml) enregistrée sur l'appareil." },
    { cibles: ["#offlineBtn"], nom: "Hors connexion",
      texte: "Télécharge tous les morceaux et les sons pour jouer sans réseau (salle sans wifi, 4G faible)." },
    { cibles: ["#installBtn"], nom: "Installer",
      texte: "Ajoute l'application à l'écran d'accueil. Sur iPhone : bouton Partager › « Sur l'écran d'accueil »." },

    /* ---- barre du haut / boutons de droite en paysage ---- */
    { cibles: ["#sessBtn", "#lpSess"], nom: "Séance",
      texte: "<b>Le chef</b> : « Je suis le chef » puis montrez le QR code ; il lance, arrête, règle tempo et boucle pour tous.<br><b>Le musicien</b> : scannez le QR code ou tapez le code. Vous gardez votre partie, l'affichage et la taille. « Reprendre la dernière séance » si la page a été fermée ; « Prendre la direction » pour devenir chef." },
    { cibles: ["#sideToggle", "#lpSide"], nom: "Réglages",
      texte: "Votre partie, l'affichage (Page, Comme imprimé, Défilement, « En paysage »), la taille, le tempo, le compteur de temps, le métronome et les volumes (Moins-un, Solo, Tutti)." },
    { cibles: ["#tuneBtn", "#lpTune"], nom: "Accordeur",
      texte: "Jouez une note tenue : elle s'affiche dans la notation de votre instrument, avec le son réel à côté. Le néon s'allume quand c'est juste. Le La (440 Hz) se règle avec − / +." },
    { cibles: ["#settingsBtn", "#lpSet"], nom: "Paramètres",
      texte: "Apparence (thèmes) et son : <b>Mesurer</b> la latence (retard d'une enceinte ou d'un casque Bluetooth), qualité des sons." },
    { cibles: ["#fullBtn"], nom: "Plein écran",
      texte: "Cache la barre du navigateur pour agrandir la partition." },
    { cibles: ["#lpView"], nom: "Paysage",
      texte: "Bascule entre le défilement (6 mesures au départ) et l'affichage standard. « Auto » dans Réglages › Affichage pour revenir au choix automatique." },

    /* ---- lecteur ---- */
    { cibles: ["#homeFab", "#backBtn"], nom: "Accueil",
      texte: "Revient à la liste des morceaux." },
    { cibles: ["#partTag"], nom: "Ma partie",
      texte: "Touchez le nom pour changer de partie." },
    { cibles: ["#scoreWrap"], nom: "Partition", position: "dedans",
      texte: "Touchez une mesure pour y placer la lecture. Deux doigts pour agrandir ou réduire. En défilement, la clé et l'armure en cours restent affichées à gauche." },
    { cibles: ["#bar"], nom: "Avancement",
      texte: "Touchez la barre pour jeter un œil à un autre endroit du morceau, sans déplacer la lecture." },
    { cibles: ["#playBtn"], nom: "Lecture",
      texte: "Lance ou met en pause. Barre d'espace sur ordinateur." },
    { cibles: ["#stopBtn"], nom: "Début",
      texte: "Arrête et revient au début du morceau." },
    { cibles: ["#posbox"], nom: "Position",
      texte: "Mesure et temps en cours. Le point « Sons » indique si les sons d'instruments sont prêts." },
    { cibles: [".tempo"], nom: "Vitesse",
      texte: "− / + change la vitesse par pas de 5 %." },
    { cibles: ["#gotoForm"], nom: "Aller à",
      texte: "Tapez un numéro de mesure puis › pour y aller directement." },
    { cibles: [".loopctl"], nom: "Boucle",
      texte: "Tapez la première et la dernière mesure (« de » / « à »), ou touchez la case puis la mesure sur la partition. La boucle repart sans décompte." },
    { cibles: ["#marks button"], nom: "Repères",
      texte: "Saute directement à une section (A, B, Coda…)." }
  ]
};
