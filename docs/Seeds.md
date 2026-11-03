# Seeds

**Seeds** are starter blueprint files a server copies into its own blueprints (`data/blueprints/`, for every project on the server). They give you a one-command way to get started with predefined project, model, structure and template blueprints.

---

## What gets seeded

Seed files don't come with the repository: you put them on the server, by kind, under `{DATA_ROOT}/data/seeds/blueprints/`:

- **project/**, **model/**, **structure/**, **template/**: one blueprint JSON file each (see [Blueprints](Blueprints.md) for their shape).

Without that folder, seeding stops with "Seeds directory not found". Most servers don't need seeds: the starter blueprints come in code from [`@moteurio/plugin-core-blueprints`](https://github.com/moteurio/moteur-plugins) (person, event, product, question and more), and a host's own come from its plugins.

Running the seed command copies **missing** files from `data/seeds/blueprints/<kind>/` into `data/blueprints/<kind>/`. Existing blueprint files are left unchanged unless you use the force option.

---

## How to run

From the **moteur** directory, with the engine built (`pnpm build`), on the server's data (`DATA_ROOT`):

```bash
# Copy only missing blueprints (safe default)
pnpm run seed

# Overwrite existing blueprint files with the seed versions
pnpm run seed:force
```

On a running server, an operator does the same with the CLI (after `moteur operator login`):

```bash
moteur operator seed
moteur operator seed --overwrite
```

---

## After seeding

Once blueprints are in `data/blueprints/`, you can:

- Create a **project** from a project blueprint (e.g. “blog”).
- Create **models**, **structures**, and **templates** from their blueprints via Studio or the API (pass `blueprintId` when creating).

See [Blueprints](Blueprints.md) for how blueprints are used, and the main [README](../README.md) for quick start.
