# Seeds

**Seeds** are canonical blueprint files that you copy into your project’s `data/blueprints/` directory. They give you a one-command way to get started with predefined project, model, structure, and template blueprints (e.g. blog, basic-page, publishable, SEO, article template).

---

## What gets seeded

Seeds live under `data/seeds/blueprints/` by kind:

- **project/** — e.g. empty, blog
- **model/** — e.g. blog-post, basic-page
- **structure/** — e.g. publishable, seo
- **template/** — e.g. landing, article, default

Running the seed command copies **missing** files from `data/seeds/blueprints/<kind>/` into `data/blueprints/<kind>/`. Existing blueprint files are left unchanged unless you use the force option.

---

## How to run

From the **moteur** directory:

```bash
# Copy only missing blueprints (safe default)
pnpm run seed

# Overwrite existing blueprint files with seed versions
pnpm run seed:force
```

Via the **CLI**:

```bash
pnpm run cli -- seed
pnpm run cli -- seed --force
```

The data root is resolved the same way as the API (e.g. `DATA_ROOT` env or default when run from the workspace root).

---

## After seeding

Once blueprints are in `data/blueprints/`, you can:

- Create a **project** from a project blueprint (e.g. “blog”).
- Create **models**, **structures**, and **templates** from their blueprints via Studio or the API (pass `blueprintId` when creating).

See [Blueprints](Blueprints.md) for how blueprints are used, and the main [README](../README.md) for quick start. For the exact layout of seed files and folder structure, see [data/seeds/README.md](../data/seeds/README.md).
