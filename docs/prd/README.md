# PRD

Requirements per feature: why it is built and what the user can do once it exists. Implementation design goes in a `dd.md` next to the PRD; hard-to-reverse decisions go in [`../adr/`](../adr/README.md).

```
prd/
└── <topic>/
    ├── prd.md      requirements (English, canonical) with `status:` frontmatter (draft | ready | in-progress | done)
    ├── prd.ja.md   Japanese version, kept in sync with prd.md
    └── dd.md       design doc, only when needed
```

- [sortie-mvp](sortie-mvp/prd.md) — one pilot, one Tello: fly a sortie, shoot down targets, record the sortie video
- [enemy-waves](enemy-waves/prd.md) — waves of virtual enemy aircraft that attack the drone and are dodged by flying it, ending with the printed target
