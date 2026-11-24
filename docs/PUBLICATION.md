# Préparer une publication GitHub

Ce guide décrit une préparation locale. Il n’autorise ni publication, ni création d’un dépôt distant, ni push.

## Périmètre public

Le code actif, ses tests, le README, les configurations npm/TypeScript/Vite, les icônes et les captures explicitement relues sont destinés au dépôt. Les archives cloud, anciens fichiers d’environnement, rapports, notes de travail et exports ne le sont pas. Rien n’est supprimé de ces dossiers pour publier le code.

Le `.gitignore` protège les opérations Git normales, pas un téléversement manuel de tout le dossier par l’interface web de GitHub. Pour ce dernier cas, utiliser uniquement le contenu extrait de l’archive de publication préparée, jamais le dossier de travail complet.

Le `.gitignore` bloque tous les JSON sauf les trois configurations racine connues, tous les CSV et formats bancaires courants, archives, documents personnels et nouvelles images. Une nouvelle capture doit être relue, contenir uniquement des données fictives, puis être autorisée explicitement dans le `.gitignore` et le contrôle de publication.

## Contrôles

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run check:publication
```

Sans dépôt Git, le dernier contrôle examine une liste de fichiers source proposés à la publication. Dans un dépôt Git, il examine les fichiers suivis et les nouveaux fichiers non ignorés. Le mode `--staged` examine les contenus réellement placés dans l’index, y compris lorsqu’une copie de travail a été modifiée depuis l’ajout.

Le contrôle recherche des chemins privés, formats de sauvegarde, signatures usuelles de secrets, affectations de mots de passe, JWT, adresses e-mail et chemins utilisateur absolus. Il ne prétend pas reconnaître tous les secrets ni analyser visuellement les images.

## Avant le premier commit

Le dossier de travail initial n’avait aucun dépôt Git ni historique. Aucun historique distant n’a été fourni ou inspecté. Ne pas supposer que cette revue s’applique à un autre dépôt GitHub existant.

Après initialisation locale ou clonage, activer le hook :

```sh
git config --local core.hooksPath .githooks
```

Vérifier les fichiers ignorés et l’index avant de créer un commit :

```sh
git status --short --ignored
npm run check:publication
git diff --cached --stat
git diff --cached --check
node scripts/check-publication.mjs --staged
```

Éviter `git add -f` sur des fichiers ignorés. Le hook bloque les chemins et contenus suspects, mais un hook peut être désactivé ou contourné avec `--no-verify`. Les sauvegardes ne sont donc pas rendues techniquement impossibles à publier : une revue humaine reste nécessaire.

## Historique et publication

Si un historique Git existe ultérieurement ou si du code est ajouté à un dépôt préexistant, le scanner avant tout push avec un outil dédié de détection de secrets et relire les changements. Une suppression dans le dernier commit ou une règle `.gitignore` n’efface pas un fichier déjà présent dans les anciens commits. Ne pas réécrire ni purger un historique sans décision explicite de son propriétaire.

Choisir la licence, le nom et la visibilité du dépôt. Aucune URL GitHub ou licence n’a été inventée dans le README. La création du dépôt distant et le push restent soumis à l’accord de l’auteur.
