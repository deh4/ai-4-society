import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const SITE = 'https://ai4society.io'

function sitemapPlugin(): Plugin {
  return {
    name: 'generate-sitemap',
    closeBundle() {
      const today = new Date().toISOString().slice(0, 10)

      const urls: Array<{ loc: string; changefreq: string; priority: string }> = [
        { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
        { loc: `${SITE}/observatory`, changefreq: 'daily', priority: '0.9' },
        { loc: `${SITE}/about`, changefreq: 'monthly', priority: '0.7' },
        { loc: `${SITE}/dashboard`, changefreq: 'daily', priority: '0.8' },
      ]

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map(
          (u) =>
            `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
        ),
        '</urlset>',
      ].join('\n')

      writeFileSync(resolve('dist', 'sitemap.xml'), xml)
      console.log('✓ sitemap.xml generated')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sitemapPlugin()],
})
