# Budget longue durée V1

## Utiliser le module

1. Configurer le compte principal si nécessaire, puis ouvrir **Budget longue durée** dans la navigation.
2. Donner un nom, un montant attendu, une période inclusive et une réserve initiale facultative.
3. Choisir les charges récurrentes à réserver. Elles sont projetées selon leur jour mensuel sur la période choisie ; il s’agit d’une copie de prévision conservée avec le budget.
4. Si le versement est attendu, aucun revenu n’est créé. Les prévisions sont identifiées comme telles, séparées des fonds reçus.
5. Si le versement est reçu, lier une opération existante ou demander explicitement la création d’une nouvelle opération de revenu. La part affectée peut être inférieure au revenu.

Un seul budget peut être actif. Les archives restent consultables sans limite de nombre imposée par le module, dans les limites de capacité du navigateur.

## Calculs et précision

Les montants métier sont des entiers en centimes. L’enveloppe variable calculée est le financement réellement affecté moins les charges fixes projetées/réconciliées et la réserve initiale. Un résultat négatif est conservé dans la synthèse et signalé ; les allocations dépensables restent non négatives, sans masquer le déficit.

La période couvre les dates de début et fin incluses. Les dates sont calculées en jours UTC, sans conversion de fuseau sur les bornes. Le montant variable est partagé proportionnellement aux jours couverts de chaque mois. Exemple du 15 novembre au 15 février : 16, 31, 31 et 15 jours pour une année non bissextile. Les quotients et restes sont calculés avec BigInt ; les plus forts restes, puis l’ordre chronologique en cas d’égalité, attribuent les derniers centimes. La somme des parts est exacte.

La prévision en attente de versement est affichée séparément. Elle ne finance pas une répartition réelle et ne modifie jamais le compte.

## Sources, personnalisation et dépenses

Les répartitions automatiques sont recalculées depuis les données sources sur toute la période. Les montants personnalisés, eux, restent enregistrés. Une modification sans rapport, comme un libellé de catégorie, ne les change pas. Si le financement diminue ou si les charges augmentent, une réduction proportionnelle provisoire est affichée avec un avertissement ; la saisie personnalisée n’est pas écrasée. Un financement supplémentaire non encore réparti manuellement apparaît comme non affecté.

La saisie d’une répartition ne peut dépasser les fonds réels disponibles. Le bouton de réinitialisation remet explicitement le mode automatique. Les transactions réelles ne sont jamais refusées parce qu’un budget est dépassé.

Les dépenses de la période sont lues dans l’historique existant. Les revenus, types autres que dépense et affectations internes ne deviennent pas des dépenses. Les transferts réels ne sont pas encore modélisés par MoneyPilot ; ce module n’en invente pas.

## Charges fixes et rapprochement

Un paiement confirmé par le système de récurrences est identifié par la récurrence et sa date d’occurrence. Il remplace sa prévision dans le total réservé. Un écart de montant est affiché et pris en compte. Un paiement saisi manuellement doit être rapproché explicitement dans le module ; aucune catégorie ou description n’est utilisée pour deviner un lien.

Les autres dépenses fixes réelles de la période sont aussi déduites. Une prévision non rapprochée reste réservée : si le paiement existe sans identifiant de récurrence, il faut choisir son lien manuellement pour ne pas conserver une réservation supplémentaire. Une opération supprimée, déplacée ou reclassée invalide le rapprochement applicable et déclenche un recalcul.

## Dépassements, surplus et imprévus

Un dépassement est compensé par les seuls mois suivants, avec leurs allocations restantes comme poids. Les centimes sont répartis exactement ; aucune allocation future n’est rendue négative. La part non couverte reste affichée. Un montant non affecté ou un surplus en attente n’est pas utilisé silencieusement pour compenser le déficit.

Après la fin d’un mois, tant que le budget est actif, choisir le montant destiné au mois suivant et/ou à la réserve. Une partie peut rester en attente. La décision est modifiable ou annulable. Si une opération antidatée rend ce choix impossible, il est conservé mais suspendu ; le surplus réel reste en attente jusqu’à révision. Le dernier solde à la clôture reste enregistré dans l’archive, sans affectation automatique.

Pour une dépense imprévue existante qui n’est pas déjà rapprochée d’une charge réservée, choisir la part prise sur la réserve ; le reste est réparti sur les mois suivants. La dépense n’est pas recréée. La réserve restante est toujours affichée. Une baisse ultérieure de financement ou une modification de dépense ne bloque pas l’édition du véritable historique : les montants applicables sont plafonnés et la décision à revoir est signalée.

## Revenus supplémentaires

Un nouveau revenu de la période n’est pas affecté automatiquement. Après son enregistrement, l’historique propose un lien pour choisir une part ou un bouton pour le garder séparé. Le choix est mémorisé et ne revient plus pour la même opération. Les affectations restent gérables depuis le module.

Une même part de revenu ne peut pas financer deux budgets. Une archive réserve son financement effectif enregistré à la clôture, et non une ancienne demande non financée. Si le revenu vivant est ensuite réduit, supprimé ou reclassé, le financement effectif d’un budget actif est plafonné et un avertissement est affiché. Les demandes initiales sont conservées pour permettre leur révision.

## Clôture et histoire

Après la date de fin, `loadSnapshot` clôture les budgets expirés dans une transaction locale lors du prochain chargement/rafraîchissement. L’opération est idempotente et ne crée pas de nouvelle ligne de budget.

La clôture conserve les réglages, répartitions, décisions, références, les copies des transactions pertinentes et le financement effectif à cet instant. Une petite synthèse finale est enregistrée et validée à l’import. L’affichage de l’archive est reconstitué depuis cet instantané figé, pas depuis l’historique vivant. Les modifications ultérieures de l’historique restent visibles dans les autres écrans, sans réécrire le bilan archivé. Aucun budget suivant n’est créé automatiquement.

## Migration et sauvegardes

La base physique `moneypilot-local-v1` et son magasin `documents` restent inchangés. Le document logique passe à `schemaVersion: 2`. Les données antérieures sont normalisées par ajout de la liste vide de budgets longue durée ; leurs opérations, soldes, catégories, budgets et récurrences restent identiques. La normalisation d’une lecture n’efface ni ne réinitialise le document ; une prochaine écriture valide enregistre la structure enrichie dans la transaction habituelle.

Les nouveaux exports utilisent le format de sauvegarde 2 et incluent intégralement les budgets et archives. Les exports de format 1 restent importables et obtiennent une liste vide. Les champs facultatifs absents reçoivent des valeurs par défaut ; les types invalides, UUID dupliqués, relations inconnues ou plusieurs budgets actifs sont rejetés. Un échec laisse l’état courant intact. La restauration conserve son aperçu, sa sauvegarde préalable, sa confirmation explicite et son remplacement atomique. Le CSV garde son rôle d’analyse des opérations et n’exporte pas les répartitions internes comme de faux mouvements.

Une sauvegarde de format 2 nécessite cette version de MoneyPilot ou une version ultérieure compatible ; une ancienne application ne sachant lire que le format 1 ne peut pas l’ouvrir.

## Vérifications et limites

69 tests automatisés passent, dont les 31 tests du nouveau module et de sa compatibilité. Ils couvrent les quatre mois complets, jours partiels, attente du versement, déficit fixe, personnalisation, dépassements, arrondis, manque de fonds futurs, surplus, réserve, revenu partiel, édition/suppression, rapprochements, clôture, archives, import/export et ancien document local.

Le navigateur a été testé sur une origine isolée avec données fictives : création attendue sans changement de solde, revenu lié sans duplication, personnalisation, dépassement, imprévu, export/restauration, réouverture, choix de revenu séparé mémorisé, mobile390×844 sans débordement et chargement/écriture serveur arrêté.

Limites de cette V1 : période et prévisions récurrentes choisies à la création conservées sans éditeur de ces réglages ; archives en lecture seule ; un seul compte en euros ; pas de transfert réel, synchronisation, chiffrement, prévision bancaire ou installation testée sur téléphone physique. Les tests de fin de mois et de clôture utilisent une date injectée ; l’horloge de l’ordinateur n’a pas été modifiée. Les très gros volumes ne font pas l’objet d’un benchmark.
