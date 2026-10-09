import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(new URL('./src/', dist), { recursive: true });
await cp(new URL('../index.html', import.meta.url), new URL('./index.html', dist));
await cp(new URL('../src/', import.meta.url), new URL('./src/', dist), { recursive: true });
await mkdir(new URL('./.openai/', dist), { recursive: true });
await cp(new URL('../.openai/hosting.json', import.meta.url), new URL('./.openai/hosting.json', dist));

console.log(`Built Signal Room at ${dist.pathname.replace(root.pathname, '')}`);
