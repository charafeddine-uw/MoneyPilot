# Code historique de la V0 / Sprint 2

Ces fichiers sont conservés pour référence pédagogique et pour les cinq tests historiques. Ils ne sont importés par aucune page ni aucun provider de la V1. Leur règle de solde (début de journée) et leur stockage local ne s’appliquent pas à la V1.

La clé de données existantes `moneypilot.budget.v1` n’est jamais supprimée ni réécrite par la V1. Aucune migration automatique n’est effectuée. Le code courant utilise `src/lib/finance.ts`, `src/providers/FinanceProvider.tsx` et IndexedDB ; la démonstration V1 utilise seulement la mémoire.
