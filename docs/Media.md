# Media

Assets are project-scoped records for images, video, audio, documents and 3D models. The engine handles asset metadata, local storage, references and image delivery. Remote storage and video hosting integrations are optional host plugins.

## Upload and edit

Upload a file using a member JWT and `multipart/form-data`; the file field is `file`:

```bash
curl -X POST "$MOTEUR_API_URL/projects/$PROJECT_ID/assets" \
  -H "Authorization: Bearer $MOTEUR_TOKEN" \
  -F "file=@photo.jpg" \
  -F "alt=A description of the picture" \
  -F "folder=articles"
```

`MOTEUR_API_URL` includes any API base path. The API upload limit is `API_UPLOAD_MAX_MB` (50 MB by default); project media rules and host plan limits can impose additional restrictions.

Use `GET /projects/:projectId/assets` to list assets, `GET /assets/:id` under the same project prefix to read one, and PATCH to update supported metadata. Listing supports type, folder and search filters plus pagination. Asset metadata includes URLs and processing state; use the URLs returned by the API rather than constructing storage paths yourself.

Project media settings live under `/projects/:projectId/media-settings`; adapter configuration is under `/asset-config`. Credentials belong on the host, not in a frontend bundle. See the running host's OpenAPI document for upload options and adapter-specific fields.

## References, crops and processing

Store asset references in image, video and asset fields instead of copying binaries into entry JSON. Delivery can resolve those references to asset metadata. Image fields may choose a crop independently of the source asset, and the asset can retain a focal point. [Images](Images.md) covers `resizeUrl`, supported sizes, crops, caching and client helpers.

Replacing a file uses `POST /projects/:projectId/assets/:id/replace` with multipart field `file`. Image variants can be regenerated through `/assets/regenerate`. Remote video processing is asynchronous and requires the corresponding host integration; do not assume that an uploaded video is immediately ready for playback.

## Usage, bin and permanent deletion

`GET /projects/:projectId/assets/:id/usage` reports known references. Check usage before removing media used by published content. Deletion moves assets to the bin; restoration uses `POST /assets/:id/restore`. Permanent bin deletion and empty-bin operations are separate and subject to role checks.

Keep original media and any external storage backups alongside content backups. Git history of entry JSON is not a backup of asset binaries. See [Operations](Operations.md).
