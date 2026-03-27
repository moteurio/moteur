# Plugin Packages Migration

`packages/plugins/*` are no longer part of the `moteur` workspace build graph.

The target architecture is:

- public plugins live in the `moteur-plugins` repository
- private plugins live in private repositories
- host composition/deployment lives in `api.moteur.io`

This directory is transitional and should be moved out package-by-package.
