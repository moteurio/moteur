<!-- Written from the field registry and packages/core/src/agentGuide/fieldExamples.ts: don't edit by hand. -->

# Field types

Every field a model, template, block or structure has, as its `fields` hold it:

```json
"fields": {
    "title": { "type": "core/text", "label": "Title", "options": { "required": true, "multilingual": true } }
}
```

- `type` and `label` (one name, or one per language: `{ "en": "Title", "fr": "Titre" }`) on every field. `description` is shown as help in the Studio.
- Options go in `options`. Every field may have `required`, `multilingual` and `ui`. The rest are its type's, listed below. An option the type doesn't have is refused when the schema is saved.
- Two things go beside `type`, not in `options`: a list's item field (`items`) and an object's fields (`fields`).
- A field that isn't required may be left out or empty (`""`, `[]`, `{}`). `allowEmpty` only matters for a required field.
- `multilingual: true`: the value is one per language, `{ "en": "…", "fr": "…" }` (rich text: `{ "dast": { "en": doc } }`).
- A value for a field the schema doesn't have is a warning when saved, and refused by an import.

Each type below: its definition and a value it accepts (both checked against Moteur by a test), then its options.

## Text

### core/text

A single-line string field with multilingual support.

```json
{
    "type": "core/text",
    "label": "Title",
    "options": {
        "required": true,
        "multilingual": true,
        "maxLength": 120
    }
}
```

Value:

```json
{
    "en": "The inbox",
    "fr": "La boîte"
}
```

A string, or one per language when the field is multilingual.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `maxLength` | number | `255` | Maximum length of the text field. |
| `minLength` | number | `1` | Minimum length of the text field. |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |
| `validation` | object |  | Validation rules for the text field. |
| `placeholder` | string | `""` | Placeholder text for the field. |
| `autocomplete` | boolean | `false` | Whether to enable autocomplete for the field. |

### core/textarea

A multi-line string field with multilingual support. Same value shape as core/text.

```json
{
    "type": "core/textarea",
    "label": "Summary",
    "options": {
        "multilingual": true
    }
}
```

Value:

```json
{
    "en": "Two lines\nof text."
}
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `maxLength` | number | `65535` | Maximum length of the text field. |
| `minLength` | number | `0` | Minimum length of the text field. |
| `allowEmpty` | boolean | `true` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |
| `placeholder` | text | `""` | Placeholder text for the field. |

### core/markdown

CommonMark markdown. Multilingual support.

```json
{
    "type": "core/markdown",
    "label": "Body",
    "options": {
        "multilingual": true
    }
}
```

Value:

```json
{
    "en": "Some **bold** words. See [our prices](page:pricing)."
}
```

CommonMark. `[words](page:<page id>)` links to a page and follows it on delivery.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowHTML` | boolean | `false` | Allow raw HTML inside the markdown field. |
| `placeholder` | text |  | Placeholder text for the markdown editor. |

### core/rich-text

Structured rich text in DAST format.

```json
{
    "type": "core/rich-text",
    "label": "Story"
}
```

Value:

```json
{
    "schema": "dast",
    "document": {
        "type": "root",
        "children": [
            {
                "type": "paragraph",
                "children": [
                    {
                        "type": "span",
                        "value": "Hello."
                    }
                ]
            }
        ]
    }
}
```

A DAST document. One per language: `{ "dast": { "en": doc, "fr": doc } }`. A link to a page names it in its meta: `{ "type": "link", "url": "/pricing", "meta": [{ "id": "pageId", "value": "pricing" }], "children": […] }`. An import may give `{ "html": "<p>…</p>" }` (or one per language) instead: it is converted.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowEmpty` | boolean | `true` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

### core/html

Raw HTML, stored as it is. For embeds and imported HTML that must stay as written.

```json
{
    "type": "core/html",
    "label": "Embed code"
}
```

Value:

```json
"<p>Raw <strong>HTML</strong>, sanitized.</p>"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowedTags` | list |  | The tags allowed. Left out, stored HTML is kept as it is. |

## Numbers and choices

### core/number

A number.

```json
{
    "type": "core/number",
    "label": "Seats",
    "options": {
        "min": 1,
        "max": 500
    }
}
```

Value:

```json
12
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `min` | number | `null` | The minimum value allowed for the number. |
| `max` | number | `null` | The maximum value allowed for the number. |
| `step` | number | `1` | The increment step for the number input. |
| `placeholder` | string | `""` | Placeholder text for the number field. |

### core/boolean

A true/false toggle field.

```json
{
    "type": "core/boolean",
    "label": "Featured"
}
```

Value:

```json
true
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `trueLabel` | text | `"Yes"` | Label for the true state. |
| `falseLabel` | text | `"No"` | Label for the false state. |

### core/select

A select field.

```json
{
    "type": "core/select",
    "label": "Size",
    "options": {
        "choices": [
            {
                "value": "small",
                "label": {
                    "en": "Small",
                    "fr": "Petit"
                }
            },
            {
                "value": "large",
                "label": {
                    "en": "Large",
                    "fr": "Grand"
                }
            }
        ]
    }
}
```

Value:

```json
"small"
```

The chosen value.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `choices` | array |  |  |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |
| `multiple` | boolean | `false` | Allow multiple selections in the select field. |
| `placeholder` | string |  | Placeholder text for the select field. |

### core/multi-select

Multiple choices from predefined options. Stored as string array.

```json
{
    "type": "core/multi-select",
    "label": "Readers",
    "options": {
        "choices": [
            {
                "value": "writer",
                "label": "Writer"
            },
            {
                "value": "developer",
                "label": "Developer"
            }
        ]
    }
}
```

Value:

```json
[
    "writer",
    "developer"
]
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `choices` | array |  | Available options for selection. |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |
| `placeholder` | text |  | Placeholder text for the select field. |

### core/color

A hexadecimal color field.

```json
{
    "type": "core/color",
    "label": "Accent"
}
```

Value:

```json
"#d9480f"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowAlpha` | boolean | `false` | Allow transparency (alpha channel). |
| `presetColors` | list |  | An optional list of preset color swatches to choose from. |
| `allowCustom` | boolean | `true` | Allow users to enter a custom color value. |

### core/icon

An icon identifier string. Refers to whatever icon system the project uses. No validation.

```json
{
    "type": "core/icon",
    "label": "Icon"
}
```

Value:

```json
"inbox"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `set` | text |  | Optional hint for which icon set to use (e.g. "lucide", "heroicons"). |

## Dates and times

### core/date

A date value stored as ISO 8601 date string (YYYY-MM-DD).

```json
{
    "type": "core/date",
    "label": "Day"
}
```

Value:

```json
"2026-11-02"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `min` | text |  | Minimum allowed date (YYYY-MM-DD). |
| `max` | text |  | Maximum allowed date (YYYY-MM-DD). |
| `placeholder` | text |  | Placeholder text for the date field. |

### core/datetime

A date-time value.

```json
{
    "type": "core/datetime",
    "label": "Starts"
}
```

Value:

```json
"2026-11-02T18:30:00Z"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `format` | text |  | Optional format for displaying the date (e.g., YYYY-MM-DD HH:mm:ss). |
| `placeholder` | text |  | Placeholder text for the date field. |

### core/time

A time value stored as HH:MM string.

```json
{
    "type": "core/time",
    "label": "Opens"
}
```

Value:

```json
"09:30"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `min` | text |  | Minimum allowed time (HH:MM). |
| `max` | text |  | Maximum allowed time (HH:MM). |
| `step` | number | `15` | Step increment for time input in minutes. |

## Links and contact

### core/link

A structured hyperlink, to a URL or a page of the project, with label, accessibility options, and visual customization.

```json
{
    "type": "core/link",
    "label": "Read more"
}
```

Value:

```json
{
    "pageId": "pricing",
    "label": {
        "en": "See prices",
        "fr": "Voir les prix"
    }
}
```

To a page: `pageId` (its `url` is filled in on delivery, in each language). To an address: `url`. In a bundle, `pageId` may be `{ "$ref": "page:pricing" }`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `target` | select | `"_self"` |  |
| `rel` | list | `[]` |  |
| `icon` | text |  |  |
| `isButton` | boolean |  |  |
| `download` | boolean | `false` | Add download attribute to the link for file downloads. |
| `prefetch` | boolean | `false` | Enable route prefetching or link hinting if supported. |
| `relativeOnly` | boolean | `false` | Restrict the link to relative URLs only. |

### core/url

A URL field.

```json
{
    "type": "core/url",
    "label": "Website"
}
```

Value:

```json
"https://example.com"
```

### core/email

An email address. Validated against standard email format.

```json
{
    "type": "core/email",
    "label": "Email"
}
```

Value:

```json
"ada@example.com"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `placeholder` | text |  | Placeholder text for the email field. |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

### core/phone

A phone number string. No format enforcement — phone formats vary globally.

```json
{
    "type": "core/phone",
    "label": "Phone"
}
```

Value:

```json
"+1 514 555 0100"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `placeholder` | text |  | Placeholder text for the phone field. |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

### core/address

A structured postal address.

```json
{
    "type": "core/address",
    "label": "Address"
}
```

Value:

```json
{
    "street": "1 Main St",
    "city": "Montréal",
    "state": "QC",
    "country": "CA",
    "postalCode": "H2X 1Y4"
}
```

## Media

### core/asset

Reference to a project asset (image, video, or document) with optional usage-level alt and caption.

```json
{
    "type": "core/asset",
    "label": "Picture"
}
```

Value:

```json
{
    "assetId": "a1b2c3",
    "alt": {
        "en": "The inbox"
    }
}
```

A file of the media library: `assetId` (in a bundle, `{ "$ref": "asset:<ref>" }`), with alt and caption for this use.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `aspectRatio` | select |  | Pictures here are cropped to this shape around their focal point (`cropUrl` when assets are resolved). Empty: as uploaded. |

### core/asset-list

List of project asset references with optional usage-level alt and caption.

```json
{
    "type": "core/asset-list",
    "label": "Gallery",
    "options": {
        "maxItems": 12
    }
}
```

Value:

```json
[
    {
        "assetId": "a1b2c3"
    },
    {
        "assetId": "d4e5f6",
        "caption": {
            "en": "Later"
        }
    }
]
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `aspectRatio` | select |  | Pictures here are cropped to this shape around their focal point (`cropUrl` when assets are resolved). Empty: as uploaded. |
| `minItems` | number |  | The fewest pictures or files the list may hold. |
| `maxItems` | number |  | The most pictures or files the list may hold. |

### core/image

An image field with alt text, caption, and optional credit.

```json
{
    "type": "core/image",
    "label": "Image by address"
}
```

Value:

```json
{
    "src": "https://example.com/inbox.png",
    "alt": {
        "en": "The inbox"
    }
}
```

A picture by address. For the media library, use core/asset.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `aspectRatio` | select | `"auto"` | Enforce a specific aspect ratio for the image. |
| `responsive` | boolean | `true` | Allow the image to scale responsively. |
| `loading` | select | `"lazy"` | Set native HTML loading behavior for the image. |
| `focalPoint` | text | `"center"` | CSS object-position value for the image focal point (e.g., 'center top'). |
| `objectFit` | select | `"cover"` | Defines how the image should be resized to fit its container. |
| `allowUpload` | boolean | `false` | Allow direct image upload instead of just URLs. |
| `decorative` | boolean | `false` | Mark the image as decorative, hiding it from screen readers. |

### core/media-image

A single image file URL or path.

```json
{
    "type": "core/media-image",
    "label": "Image file"
}
```

Value:

```json
{
    "src": "https://example.com/inbox.png"
}
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowedExtensions` | list | `["jpg","jpeg","png","webp","gif","avif","svg","svgz"]` | Allowed image file extensions. |
| `maxSize` | number |  | Maximum file size (in bytes) for the image. |
| `maxWidth` | number |  | Maximum width (in pixels) for the image. |
| `maxHeight` | number |  | Maximum height (in pixels) for the image. |

### core/audio

A sound file from the media library or a URL, with a title and transcript.

```json
{
    "type": "core/audio",
    "label": "Episode"
}
```

Value:

```json
{
    "assetId": "a7b8c9",
    "title": "Episode 1"
}
```

`assetId` (media library) or `src` (an address).

### core/video

A video field.

```json
{
    "type": "core/video",
    "label": "Clip"
}
```

Value:

```json
{
    "provider": "youtube",
    "target": "dQw4w9WgXcQ",
    "title": "A clip"
}
```

A video at a provider: `provider` and its `target` id.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `autoplay` | boolean | `false` |  |
| `loop` | boolean | `false` |  |
| `muted` | boolean | `false` |  |
| `controls` | boolean | `true` |  |

### core/model-3d

A 3D asset reference. Primary format is glTF/glb for web compatibility.

```json
{
    "type": "core/model-3d",
    "label": "Model"
}
```

Value:

```json
{
    "src": "https://example.com/chair.glb",
    "alt": "A chair"
}
```

## Structured data

### core/object

Flexible key-value object.

```json
{
    "type": "core/object",
    "label": "Author",
    "fields": {
        "name": {
            "type": "core/text",
            "label": "Name",
            "options": {
                "required": true
            }
        },
        "role": {
            "type": "core/text",
            "label": "Role"
        }
    }
}
```

Value:

```json
{
    "name": "Ada",
    "role": "Editor"
}
```

Its fields go in `fields` (beside `type`, not in `options`).

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowEmpty` | boolean | `true` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

### core/list

A repeatable list of values or structured objects.

```json
{
    "type": "core/list",
    "label": "Steps",
    "items": {
        "type": "core/text",
        "label": "Step"
    },
    "options": {
        "minItems": 1
    }
}
```

Value:

```json
[
    "Write",
    "Review",
    "Publish"
]
```

The item field goes in `items`, beside `type` (not in `options`). An item may be a core/object.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |
| `minItems` | number | `0` |  |
| `maxItems` | number |  |  |
| `sortable` | boolean | `true` | Allow manual reordering of list items. |
| `uniqueItems` | boolean | `false` | Whether items in the list must be unique. |
| `summary` | text |  | Item sub-field key (or list of keys) shown on collapsed items in Studio. Default: the first words of the item. |

### core/map

Keys to values, each value of one field type. Stored as an object.

```json
{
    "type": "core/map",
    "label": "Answers",
    "options": {
        "value": {
            "type": "core/text",
            "label": "Answer"
        },
        "keys": [
            "yes",
            "no"
        ]
    }
}
```

Value:

```json
{
    "yes": "Right",
    "no": "Not yet"
}
```

Keys to values of one field type (`options.value`). `options.keys` lists the keys allowed, or any key without it.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | object |  | The field each key holds, e.g. `{ "type": "core/text" }` or an object with its own fields. Default: text. |
| `keys` | list |  | The keys it may have, in order: `["en", "fr"]` or `[{ "value": "en", "label": "English" }]`. Empty: any key. |

### core/structure

A reusable structured field defined by a shared schema.

```json
{
    "type": "core/structure",
    "label": "Call to action",
    "options": {
        "structure": "cta"
    }
}
```

Value:

```json
{
    "label": {
        "en": "Try it"
    },
    "link": {
        "url": "https://example.com"
    }
}
```

The fields of a shared structure (`options.structure`: the project's `cta`, the server's `core/seo`).

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `structure` | text |  | The ID of the shared structure schema (e.g., 'myApp/teamMember'). |
| `inlineSchema` | object |  | The schema definition for this structure, which defines the fields and their types. |

### core/variant

One of several shapes, each with its own fields, chosen by its kind.

```json
{
    "type": "core/variant",
    "label": "Exhibit",
    "options": {
        "variants": {
            "image": {
                "label": "Picture",
                "fields": {
                    "picture": {
                        "type": "core/asset",
                        "label": "Picture"
                    }
                }
            },
            "code": {
                "label": "Code",
                "fields": {
                    "code": {
                        "type": "core/textarea",
                        "label": "Code"
                    }
                }
            }
        }
    }
}
```

Value:

```json
{
    "kind": "code",
    "code": "moteur imports run site.json"
}
```

One of several shapes: `kind` names it, its fields sit beside it.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `variants` | object |  | The shapes, by kind: `{ "image": { "label": "Image", "fields": { … } } }`. The order is the order Studio offers them in. |
| `default` | text |  | The kind a new value starts as. Default: the first variant. |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

### core/table

A 2D table with optional row/column titles and mixed cell types.

```json
{
    "type": "core/table",
    "label": "Prices"
}
```

Value:

```json
{
    "rows": [
        [
            "Free",
            "0"
        ],
        [
            "Pro",
            "39"
        ]
    ]
}
```

Rows of cells, with optional `rowTitles` and `columnTitles`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `validateCellSchema` | object |  | Use a full Field schema for validating each cell. Leave empty for no validation. |
| `minRows` | number |  |  |
| `maxRows` | number |  |  |
| `minCols` | number |  |  |
| `maxCols` | number |  |  |
| `allowEmptyCells` | boolean | `true` |  |

### core/json

A raw JSON blob. Escape hatch for unstructured or developer-defined data.

```json
{
    "type": "core/json",
    "label": "Settings"
}
```

Value:

```json
{
    "theme": "dark",
    "columns": 3
}
```

Any JSON. Prefer a typed field: core/object, core/list, core/map.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `schema` | object |  | Optional JSON Schema for validation if desired. |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

## Relations

### core/relation

A reference to a single entry in another model, or to a page.

```json
{
    "type": "core/relation",
    "label": "Author",
    "options": {
        "model": "author"
    }
}
```

Value:

```json
"ada"
```

An entry's id (in a bundle, `{ "$ref": "entry:author/ada" }`). With `target: "pages"`, a page's id.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `target` | select | `"entries"` | Entries of a model (the default), or pages of the site. |
| `model` | text |  | The model ID to reference (required unless it points at pages). |
| `fields` | list |  | For pages: the fields of each page delivered with it (e.g. ["seo"]). Its id, label and address always are. |
| `labelField` | text |  | Which field to use as label in the UI. Default: first text field. |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

### core/relations

References to multiple entries in another model, or to pages. Stored as array.

```json
{
    "type": "core/relations",
    "label": "Related",
    "options": {
        "target": "pages"
    }
}
```

Value:

```json
[
    "pricing",
    "about"
]
```

Ids, in order. Delivered pages come as `{ id, label, url }`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `target` | select | `"entries"` | Entries of a model (the default), or pages of the site. |
| `model` | text |  | The model ID to reference (required unless it points at pages). |
| `fields` | list |  | For pages: the fields of each page delivered with it (e.g. ["seo"]). Its id, label and address always are. |
| `labelField` | text |  | Which field to use as label in the UI. Default: first text field. |
| `allowEmpty` | boolean | `true` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |
| `sortable` | boolean | `true` | Allow manual reordering of relations. |
| `minItems` | number | `0` | Minimum number of relations required. |
| `maxItems` | number |  | Maximum number of relations allowed. |

### core/categories

A list of category IDs, referencing a structured category model.

```json
{
    "type": "core/categories",
    "label": "Categories",
    "options": {
        "source": "category"
    }
}
```

Value:

```json
[
    "news",
    "product"
]
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `multiple` | boolean | `true` |  |
| `source` | text |  | Reference to where categories are defined, like "project/categories". |

### core/tags

A list of tag IDs, with multilingual support in the tag model.

```json
{
    "type": "core/tags",
    "label": "Tags",
    "options": {
        "source": "tag"
    }
}
```

Value:

```json
[
    "cms",
    "git"
]
```

`options.source` is required.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowNew` | boolean | `true` |  |
| `maxTags` | number | `10` |  |
| `separator` | text | `","` |  |
| `source` | text |  | Reference to where tags are defined, like "project/tags". |

## Blocks

### core/block-list

Ordered block instances (add / reorder / remove). Use for freeform page or entry bodies.

```json
{
    "type": "core/block-list",
    "label": "Blocks",
    "options": {
        "allowedBlockTypes": [
            "core/hero",
            "hero"
        ]
    }
}
```

Value:

```json
[
    {
        "type": "core/hero",
        "data": {
            "title": {
                "en": "Moteur"
            }
        }
    }
]
```

Blocks in order: `{ type, data }`. A project's own block is named without a slash (`hero`), the server's with one (`core/hero`). `data` holds only the block's fields.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allowedBlockTypes` | json |  | Optional JSON array of block type ids (e.g. ["core/paragraph","core/heading"]). Empty = all registered blocks. |
| `minBlocks` | number |  | Minimum number of blocks (default 0). |
| `maxBlocks` | number |  | Maximum number of blocks (optional). |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

### core/layout

Preset block regions from a project Layout. Editors fill its slots, and the Layout sets their structure and order.

```json
{
    "type": "core/layout",
    "label": "Regions",
    "options": {
        "defaultLayoutId": "two-columns"
    }
}
```

Value:

```json
[]
```

Blocks placed in the slots of a project Layout. Most sites use core/block-list.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `defaultLayoutId` | text |  | If set, layoutId in stored value must match this layout id. |
| `allowEmpty` | boolean | `false` | With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty. |

## System

### core/slug

A URL-friendly identifier, usually generated from another field like title.

```json
{
    "type": "core/slug",
    "label": "Slug",
    "options": {
        "sourceField": "title"
    }
}
```

Value:

```json
"the-inbox"
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `multilingual` | boolean | `false` | Whether the slug is multilingual. |
| `sourceField` | text |  | Field to generate slug from if not manually entered (e.g., title). |
| `separator` | text | `"-"` | Character used to separate words (default: '-'). |
| `uniqueScope` | select | `"model"` | Scope for slug uniqueness (e.g., project, model, etc.). |
| `allowCustom` | boolean | `true` | Whether editors can manually override the slug. |
| `lowercase` | boolean | `true` | Whether the slug should be forced to lowercase. |

### core/id

A unique identifier. Auto-generated UUID. Read-only — never writable via API.

```json
{
    "type": "core/id",
    "label": "Id"
}
```

Value:

```json
"0f8fad5b-d9cb-469f-a165-70867728950e"
```

Made by Moteur, never written.

### core/order

Manual sort order. Integer. Opt-in — not on every model by default.

```json
{
    "type": "core/order",
    "label": "Order"
}
```

Value:

```json
3
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `default` | number | `0` | Default order value on creation. |

### core/status

Workflow status for an entry. Opt-in — not on every model by default.

```json
{
    "type": "core/status",
    "label": "Stage"
}
```

Value:

```json
"draft"
```

A workflow stage of the model's own. `options.values` lists them (not `choices`). Not the entry's publication, which is its `status`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `values` | array | `[{"value":"draft","label":"Draft"},{"value":"in_review","label":"In Review"},{"value":"published","label":"Published"}]` | Available status options. |
| `default` | text | `"draft"` | Default status on creation. |
