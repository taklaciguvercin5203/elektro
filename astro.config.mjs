import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [starlight({
    title: 'Elektronik',
    defaultLocale: 'root',
    locales: {
      root: {
        label: 'Türkçe',
        lang: 'tr',
      },
    },
    tableOfContents: false,
    customCss: [
      './src/styles/custom.css',
    ],
    components: {
      Header: './src/components/Header.astro',
      PageTitle: './src/components/PageTitle.astro',
    },
    expressiveCode: {
      themes: ['github-dark', 'github-light'],
      styleOverrides: {
        borderRadius: '0.7rem',
        frames: {
          shadowColor: 'rgb(190, 55, 20)',
        },
      },
    },
    sidebar: [
      {
        label: 'Temel ve Dijital Elektronik',
        items: [{ autogenerate: { directory: 'temel-ve-dijital-elektronik' } }],
      }
    ],
  })],
});
