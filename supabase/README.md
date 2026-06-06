# Supabase

Centralized location for the repo's Supabase projects. Each subfolder is a
**separate Supabase project / database** — they are not consolidated into one DB
(different schemas, domains, and `project_id`s):

| Folder        | App                | Domain   | Migration naming    |
| ------------- | ------------------ | -------- | ------------------- |
| `vizmaya-fyi/`| `apps/vizmaya-fyi` | Viz app  | `0NN_name.sql`      |
| `vizf1/`      | `apps/vizf1`       | Formula 1| `0NN_name.sql`      |
| `footshorts/` | `apps/footshorts`  | Football | `YYYYMMDDhhmmss_*`  |

Application code reaches these DBs through the `@vismay/content-source/supabase`
client (env-configured connection), not through these folders directly.

## Running the Supabase CLI

The CLI auto-discovers a `supabase/` directory; with this nested layout, point
it at the project folder with `--workdir`:

```sh
supabase --workdir supabase/footshorts db push
```

(Only `footshorts/` currently has a `config.toml`. `vizmaya-fyi/` and `vizf1/`
hold migrations applied via the Supabase dashboard / direct connection.)
