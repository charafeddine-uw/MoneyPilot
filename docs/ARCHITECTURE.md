# Architecture et fichiers historiques

La V1 active est une application locale. `App.tsx` assemble les routes, `FinanceProvider` orchestre les mutations et le repository isole IndexedDB des écrans. `localModel.ts` valide les documents et sauvegardes ; `localDatabase.ts` attend le commit ou le rollback avant de résoudre une écriture. Les règles de calcul vivent dans `lib/finance.ts`.

## Fichiers actifs ou conservés

| Éléments | Statut |
| --- | --- |
| Pages, composants, layout et provider actuels | Utilisés par l’application |
| `src/services/`, `src/lib/finance.ts`, `download.ts`, `offline.ts`, `demoV1.ts` | Actifs |
| `src/legacy/lib/budget.ts` et types V0 | Conservés pour cinq tests historiques |
| `src/legacy/hooks/useBudget.tsx`, `components/TransactionList.tsx`, `lib/demo.ts`, `lib/format.ts` | Absents du graphe d’exécution V1 ; conservés sans suppression pour référence |
| Anciennes classes CSS `.auth-panel`, `.auth-links`, `.auth-caption` et règles associées | Héritées du parcours Auth, sans page Auth active ; pas de nettoyage risquant d’affecter le style pendant cette revue |
| `archive/`, `supabase/`, anciennes documentations Supabase | Historique local, exclu de la publication |
| `work/`, `outputs/`, `PROJECT_CONTEXT.md` | Fichiers de travail et rapports locaux, exclus de la publication |
| `dist/`, `node_modules/`, `*.tsbuildinfo` | Fichiers générés ou réinstallables, exclus de Git |

Aucune donnée ni fonctionnalité n’a été supprimée pour préparer la publication. Les fichiers V0 peuvent être étudiés séparément, mais leurs règles de solde ne doivent pas être confondues avec celles de la V1. L’identifiant technique hérité `user_id` ne représente pas un utilisateur authentifié.

## Limites assumées

La persistance utilise un document structuré unique, relu et validé à chaque mutation. Cela simplifie les restaurations atomiques pour une petite application personnelle, sans prétendre offrir les performances d’une base indexée par transaction. Les montants sont des entiers en centimes ; les dépassements de précision sont refusés. Le cache PWA contient uniquement des ressources statiques.

## Budget longue durée

`types/longTerm.ts` décrit les réglages, références de financement, prévisions fixes et décisions. `lib/longTerm.ts` est un moteur pur : jours UTC inclusifs, partage entier par les plus forts restes, rapprochement des charges, compensation des dépassements, surplus et réserve. Les décisions personnalisées restent des données sources ; les ajustements sont dérivés et ne sont pas transformés en transactions.

`longTermRepository.ts` applique les commandes dans la transaction IndexedDB existante. Il vérifie les montants affectables et la version ouverte. Seule la commande de création peut ajouter un revenu, si son enregistrement est explicitement demandé. `longTermValidation.ts` contrôle les relations et les sauvegardes ; une archive conserve les transactions et financements utilisés à la clôture.

La version physique de la base reste 1 : aucun magasin n’est supprimé ou recréé. Le document logique passe en version 2 en ajoutant une liste vide aux données anciennes, sans modifier les opérations. Les sauvegardes exportées sont au format 2 ; les formats 1 et 2 restent lisibles. Les champs facultatifs absents sont initialisés ; un tableau explicitement invalide est refusé.
