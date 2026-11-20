import { writeFile } from 'node:fs/promises';

const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  siteUrl: process.env.URL || 'http://localhost:8888',
};

await writeFile('public-config.js', `window.AUTOSPEKT_CONFIG = ${JSON.stringify(config)};\n`);
console.log(config.supabaseUrl ? 'Supabase public config generated.' : 'No Supabase project configured; app will show setup mode.');
