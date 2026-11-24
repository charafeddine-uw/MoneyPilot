# Dossier prêt pour GitHub

Préparé le 24 novembre 2026. Aucune publication ni aucun push effectué.

## Contenu

Code React/TypeScript, configurations, verrou npm, tests, scripts, icônes, capture approuvée, README et documentation technique. Les dossiers node_modules et dist ne sont pas livrés : ils se recréent avec les commandes ci-dessous.

Les sauvegardes financières, scénarios JSON locaux, archives Supabase, fichiers de configuration privés et notes personnelles ont été exclus. Le dossier de travail d’origine reste intact. Cette copie ne contient aucun historique Git ; un éventuel dépôt GitHub existant nécessite sa propre revue.

## Lancer et vérifier

Depuis ce dossier :

```sh
npm ci
npm test
npm run build
npm run check:publication
npm run dev
```

Ouvrir l’adresse affichée par Vite. Le parcours /demo utilise uniquement des données fictives.

## Publier vous-même sur GitHub

1. Créer un nouveau dépôt sur GitHub, avec le nom et la visibilité de votre choix. Pour un dépôt neuf, ne pas ajouter de README à distance : celui du projet est déjà fourni.
2. Pour un dépôt public de portfolio, relire les fichiers et choisir éventuellement une licence. Aucune licence n’a été choisie à votre place.
3. Depuis ce dossier uniquement, initialiser Git et préparer un premier commit :

```sh
git init
git branch -M main
git config --local core.hooksPath .githooks
git add .
node scripts/check-publication.mjs --staged
git diff --cached --stat
git commit -m "Initialiser MoneyPilot V1 locale"
```

4. Utiliser ensuite les commandes de connexion au dépôt distant et de push affichées par GitHub. Ces commandes publient le projet : elles n’ont pas été exécutées lors de la préparation.

Si vous utilisez plutôt le téléversement manuel de GitHub, extraire le ZIP puis envoyer le contenu de ce dossier (pas le ZIP ni le dossier de travail original). Le téléversement manuel ne bénéficie pas de la protection automatique du .gitignore : ne pas y ajouter vos fichiers personnels. Le transfert avec Git conserve plus facilement les fichiers cachés .gitignore et .githooks.

## Vérifications de préparation

- Installation propre avec npm ci réussie dans le dossier livré (90 paquets).
- 69 tests automatisés réussis dans cette copie, aucun échec.
- Compilation TypeScript et build Vite réussis.
- Contrôle automatisé de publication réussi sur les 70 fichiers sélectionnés.
- Capture fournie relue visuellement : écran de paramètres vide, sans donnée personnelle.
- Aucun secret détecté par les règles du scanner ; ce contrôle ne garantit pas la détection de toute information sensible.
- Aucun historique Git dans le dossier livré ; aucun historique distant inspecté.
- Interface et fonctionnalités préservées. Correction documentaire : le README distingue les projections existantes du budget longue durée des modules futurs.

## Limites conservées

Données locales dans le navigateur, sans chiffrement applicatif ni synchronisation entre appareils. Installation PWA sur téléphone physique encore à valider. Sauvegardes JSON régulières recommandées. Aucun déploiement public n’a été effectué.
