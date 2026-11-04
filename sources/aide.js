/* =====================================================================
   TEXTES DE L'AIDE — modifiables librement
   - premiersPas : les écrans de la visite guidée (montrée à la première ouverture,
     puis via « ? » › « Revoir les premiers pas »). Champ « action » facultatif :
     "latence" ajoute le bouton « Mesurer maintenant ».
   - rappelLatence : la ligne ajoutée à « Avant de jouer » (séance) tant que la
     latence n'a pas été mesurée sur cet appareil.
   - sections : l'aide complète (bouton « ? »). Le texte accepte <b>, <i>, <br>.
   ===================================================================== */
const AIDE = {
  premiersPas: [
    { icone: "🎺", titre: "Bienvenue dans la Banda !",
      texte: "Cette application sert à répéter : votre partie s'affiche et suit la musique, et vous entendez toute la banda autour de vous. Quelques écrans pour démarrer, c'est rapide." },
    { icone: "🎼", titre: "Un morceau, votre partie",
      texte: "Touchez un morceau dans la liste. Votre partie apparaît en haut à gauche de la partition : touchez son nom pour en changer. L'application s'en souviendra." },
    { icone: "▶️", titre: "Lire, ralentir, boucler",
      texte: "▶ lance la lecture, ■ revient au début. <b>− / +</b> change la vitesse. <b>Boucle</b> : tapez « de » et « à » (ou touchez les mesures). <b>Mes. n°</b> va directement à une mesure. Deux doigts pour agrandir la partition." },
    { icone: "🎧", titre: "Réglez la latence (important)", action: "latence",
      texte: "Avec une enceinte ou un casque Bluetooth, le son arrive en retard sur la partition. Mesurez ce retard <b>une fois par appareil de sortie</b> : volume assez fort, téléphone près de l'enceinte, dans le calme. L'application émet quelques bips et s'ajuste toute seule." },
    { icone: "📱", titre: "Téléphone en paysage",
      texte: "Tournez le téléphone : la partition défile sur une ligne, environ 6 mesures à l'écran. La taille reste réglable (deux doigts). Le bouton ▤ repasse en affichage standard ; « Auto » dans Réglages › Affichage pour revenir." },
    { icone: "📡", titre: "Jouer ensemble en séance",
      texte: "Le chef touche <b>Séance</b> › « Je suis le chef » et montre le QR code. Les musiciens le scannent (ou tapent le code). Ensuite, c'est le chef qui lance, arrête et règle le tempo pour tout le monde." },
    { icone: "🎉", titre: "C'est parti !",
      texte: "Le bouton <b>?</b> (en haut, ou dans Paramètres) ouvre l'aide complète et permet de revoir ces premiers pas. Bonne répétition !" }
  ],

  rappelLatence: {
    titre: "Pensez à régler la latence",
    texte: "La latence n'a pas encore été mesurée sur cet appareil. Si vous jouez avec le son de ce téléphone (enceinte, casque), mesurez-la maintenant : c'est 10 secondes.",
    bouton: "Mesurer maintenant"
  },

  sections: [
    { titre: "Choisir un morceau et sa partie",
      texte: "Touchez un morceau dans la liste (la recherche filtre par titre). Le nom de votre partie est affiché en haut à gauche de la partition : touchez-le pour en changer. Le bouton maison revient à la liste." },
    { titre: "Lecture et navigation",
      texte: "▶ / ⏸ lance ou met en pause, ■ revient au début. <b>− / +</b> : vitesse par pas de 5 %. <b>Mes. n°</b> : aller à une mesure. Toucher une mesure sur la partition y place la lecture. Les repères (A, B…) sous la partition permettent de sauter directement à une section." },
    { titre: "Boucle",
      texte: "Touchez <b>Boucle</b>, puis tapez la première et la dernière mesure (« de » / « à »), ou touchez la case puis la mesure sur la partition. La lecture repart au début de la boucle sans décompte." },
    { titre: "Affichage, taille et paysage",
      texte: "Réglages › Affichage : <b>Page</b>, <b>Comme imprimé</b> (mêmes lignes que la partie papier) ou <b>Défilement</b> (une ligne qui défile). La taille se règle avec le curseur ou avec deux doigts.<br>En <b>paysage</b>, un téléphone passe en défilement avec environ 6 mesures visibles ; la taille choisie en paysage est retenue à part. Le réglage « En paysage » propose <b>Auto</b> (téléphone : défilement, tablette : affichage standard), <b>Défilement</b> ou <b>Standard</b>. Sur téléphone, le bouton ▤ bascule rapidement." },
    { titre: "Volumes : moins-un, solo, tutti",
      texte: "<b>Moins-un</b> coupe votre partie pour jouer par-dessus. <b>Solo</b> n'écoute que votre partie. <b>Tutti</b> remet tout le monde. Chaque pupitre a son volume ; « Par défaut » remet les volumes, muets et solos d'origine." },
    { titre: "Compteur de temps et métronome",
      texte: "Réglages › Tempo : <b>Compteur de temps</b> affiche le numéro du temps et quatre barres qui s'allument à chaque double croche. <b>Métronome</b> ajoute un clic. <b>Décompte</b> joue une mesure vide avant de démarrer." },
    { titre: "Latence (retard du son)",
      texte: "Paramètres › <b>Mesurer</b>. Volume assez fort, téléphone près de l'enceinte, dans le calme : quelques bips sont émis et le retard est mesuré. La valeur est retenue pour chaque sortie audio (haut-parleur, casque, enceinte). <b>Auto</b> revient à la valeur annoncée par l'appareil. Si le curseur semble encore décalé, ajustez « Curseur » dans Réglages › Affichage." },
    { titre: "Accordeur",
      texte: "Bouton diapason : jouez une note tenue. La note s'affiche dans la notation de votre instrument, avec le son réel à côté. Le néon s'allume quand vous êtes juste. Le La de référence (440 Hz) se règle avec − / +." },
    { titre: "Séance : le chef",
      texte: "<b>Séance</b> › « Je suis le chef : créer la séance ». Montrez le QR code ou dictez le code à 4 caractères. Le chef choisit le morceau, lance, arrête, règle tempo et boucle pour tous. Son téléphone garde 4 liaisons directes ; les musiciens suivants sont relayés automatiquement par d'autres téléphones. Pour passer la main : « Prendre la direction » sur le téléphone d'un musicien." },
    { titre: "Séance : le musicien",
      texte: "Scannez le QR code du chef ou tapez le code puis <b>Rejoindre</b>. Vous gardez le choix de votre partie, de l'affichage et de la taille. « Entendre le son sur ce téléphone » active le son (au casque de préférence). Si la page a été fermée, <b>Reprendre la dernière séance</b> vous y remet." },
    { titre: "Hors connexion et installation",
      texte: "<b>Hors connexion</b> (dans la liste) télécharge tous les morceaux et les sons pour jouer sans réseau. <b>Installer l'application</b> l'ajoute à l'écran d'accueil (sur iPhone : bouton Partager › « Sur l'écran d'accueil »)." },
    { titre: "En cas de souci",
      texte: "<b>Pas de son</b> : vérifiez le volume, touchez ▶ une fois (le téléphone exige un geste). <b>Son décalé</b> : refaites la mesure de latence. <b>Connexion à la séance difficile</b> : passez sur le wifi de la banda, puis réessayez ; l'application réessaie aussi toute seule. <b>Affichage bizarre</b> : changez d'affichage ou de taille, ou rechargez la page." }
  ]
};
