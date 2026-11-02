# @moteurio/frontend-plugin-poll

Poll blocks from [Moteur](https://moteur.io) on your site. The question and its choices come with the block, so the poll is on the page at once. The browser calls the API only to vote, and for the counts.

```bash
npm install @moteurio/frontend-plugin-poll
```

## With a block registry

```ts
import { createBlockRegistry } from '@moteurio/client';
import { pollRenderer } from '@moteurio/frontend-plugin-poll';

const poll = pollRenderer({ apiBase: 'https://api.moteur.io', projectId: 'my-site' });
const blocks = createBlockRegistry({
    load: async type => (type === 'play/poll' ? poll : Promise.reject())
});
```

The poll is a form inside `<moteur-poll>`: radio buttons, or checkboxes when the editor allows several choices, with the question as the legend. Everything it writes is escaped.

## Voting

```ts
import '@moteurio/frontend-plugin-poll/element';
```

Once loaded, the form votes. A visitor votes once per poll: the API checks, and the browser remembers. After voting they see the counts when the editor chose "Show results after voting", a thank you otherwise.

The words it adds are English. Give your own on the element:

```ts
document.querySelector('moteur-poll').labels = {
    vote: 'Voter',
    thanks: 'Merci d’avoir voté.',
    failed: 'Votre vote n’est pas passé. Réessayez dans un instant.',
    votes: n => (n < 2 ? `${n} vote` : `${n} votes`)
};
```

MIT
