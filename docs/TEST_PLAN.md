# Vérification de la V1 locale — 16 novembre 2026

## Automatisé, exécuté

`npm test` : 69 réussis, 0 échec, 0 ignoré.

- 31 tests du budget longue durée : répartition précise, périodes partielles, financement attendu/reçu, charges fixes, personnalisation et arrondis, dépassements et futurs insuffisants, surplus et révision des choix, réserve/imprévus, revenus partiels et non dupliqués, édition/suppression, clôture figée/idempotente, lecture des anciennes données, sauvegardes v1/v2 et validation des archives.
- 5 tests V0 conservés ; 11 tests de calcul V1 conservés (centimes, référence, revenus/dépenses, mois, budgets, récurrences mensuelles, CSV sécurisé, limites de précision).
- 14 tests locaux : premier démarrage, création/persistance, modification/suppression, UUID rejoué, récurrence atomique/idempotente, JSON complet, invalidité/version incompatible, relations/doublons/secrets inattendus, conflits, transaction annulée, erreurs/quota simulé, catégories, réinitialisation, sauvegarde concurrente.
- 5 tests de préparation Git : fichiers ignorés, ajout forcé, contenu de l’index, sauvegardes renommées et blocage effectif du hook avant commit.
- 3 tests de configuration/PWA : manifest/icônes, absence d’auth/SDK cloud actif, ressources hors ligne avec en-tête Vary:Origin.

`npm run check:publication` : réussi sur les fichiers proposés à la publication et l’index du dépôt temporaire de contrôle.

`npm run typecheck` : réussi. `npm run build` : réussi, 2 ressources JS/CSS précachées ; syntaxe du service worker vérifiée à chaque build. `npm audit --audit-level=high --cache ./work/npm-cache` : 0 vulnérabilité.

Les tests IndexedDB utilisent fake-indexeddb ; ils ouvrent et ferment réellement les connexions simulées. Les tests SQL/Auth précédents sont archivés, pas présentés comme tests de cette version locale.

## Navigateur — essais antérieurs conservés, non rejoués lors de la revue GitHub

- Premier lancement -> Setup sans authentification ; compte initial 1000 €, référence15novembre.
- Ajout dépense12,34 € -> Historique ; rechargement complet -> toujours présente.
- Fermeture puis réouverture d’un onglet -> accueil direct, solde987,66 €.
- Modification à15,55 €, confirmation visible dans l’historique.
- Export JSON réellement téléchargé ; prévisualisation ; bouton bloqué avant sauvegarde préalable et confirmation.
- Restauration ->12,34 €, solde987,66 €. Import dans une autre origine locale, compte et transaction conservés.
- Chrome, build final, origine5185 : indicateur « Ressources hors ligne prêtes », arrêt du serveur ; rechargement complet réussi ; sélection/import JSON, export préalable téléchargé, restauration réussie sans serveur ; nouvelle dépense2 € ; rechargement ->2 transactions, montants12,34 € et2 €.
- Responsive390×844 : largeur du document390px, pas de débordement horizontal, navigation inférieure visible. Desktop et paramètres consultés.
- Origine principale5173 : accès direct à Setup, aucun compte/fixture financière créé.

## Limites honnêtes

Pas de test sur téléphone physique iOS/Android, installation effective sur écran d’accueil, redémarrage complet du navigateur/processus ou de l’ordinateur, ni test de pression disque réelle. Fermeture/réouverture d’onglet et connexions IndexedDB vérifiées ; quota simulé avec rollback. Les budgets et récurrences sont couverts par les tests de domaine et de stockage, pas par un nouveau parcours manuel exhaustif de tous les formulaires.

## Avant diffusion à des proches

Ouvrir le build via une origine HTTPS stable adaptée au téléphone, installer puis activer le mode avion ; fermer/réouvrir l’app ; créer/modifier/supprimer une opération ; transférer le JSON par un moyen choisi par la personne ; vérifier ses montants après restauration. Ne pas déployer sans accord. Ne pas assimiler un changement de port à une perte des données : les origines ont des espaces distincts.

## Essais réels du module longue durée

Sur l’origine isolée5190, sans donnée personnelle : compte fictif100€, création attendue930€ / réserve93€ /15novembre–15février. Solde toujours100€ tant qu’aucune recette n’est créée. Enregistrement réel d’une recette fictive930€, puis affectation au budget : une seule recette, enveloppe variable837€, répartition automatique144/279/279/135€ (16/31/31/15jours).

Personnalisation100/300/300/100€, non affecté37€, conservée au rechargement. Dépense fictive150€ : dépassement50€, futurs diminués proportionnellement à278,57/278,57/92,86€ (total650€). Décision d’imprévu50€ sur réserve et100€ sur futurs : réserve43€, futurs600€, solde du compte toujours880€ (100+930−150), deux opérations seulement.

Export JSONv2 réellement téléchargé, contrôlé, restauré après aperçu/sauvegarde préalable/confirmation ; répartition, référence de revenu et décision d’imprévu retrouvées. Revenu fictif supplémentaire5€ : option non bloquante de séparation visible puis masquée après choix, y compris au rechargement. Budget toujours financé par930€ seulement.

Build final rouvert après fermeture des onglets ; contrôle mobile390×844 : largeur du document390px et navigation à7entrées. Serveur arrêté : rechargement du module, écriture de réinitialisation explicite de la répartition recommandée et nouveau rechargement réussis. Console sans erreur capturée. Captures enregistrées dans les sorties locales, non publiées.

Pas de nouveau parcours manuel exhaustif du rapprochement fixe, des surplus de mois antérieurs ou des archives dans le navigateur ; ces cas sont couverts par les tests purs/IndexedDB avec date injectée. Pas de test sur appareil physique ou de changement d’horloge système.
