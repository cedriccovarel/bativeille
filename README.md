# bativeille — V4.3

Interface de veille documentaire et réglementaire orientée bâtiment, écologie, économie du bâtiment et cibles Prestaterre.

## Ce que contient cette version

- UI retravaillée, plus lisible et plus "dashboard" ;
- bannière moins envahissante ;
- identité visuelle centrée sur `#06402B` ;
- logo **phare au-dessus d’une maison** ;
- recherche, filtres, tags, favoris et dossiers favoris ;
- section "sources suivies" ;
- génération de bloc JSON pour ajouter une source ;
- mise à jour automatique possible via **GitHub Actions** ;
- compatible **GitHub Pages**.

## Structure

- `index.html` : page principale
- `style.css` : styles
- `app.js` : interactions front-end
- `data.js` : base de données utilisée par le site
- `sources.json` : liste des sources à surveiller
- `manual_entries.json` : ajouts manuels éventuels
- `scripts/update-feeds.mjs` : script de collecte multi-méthodes (RSS/Atom, WordPress API, sitemap XML, pages actualités ciblées)
- `.github/workflows/update-feeds.yml` : GitHub Action toutes les 3 heures
- `assets/logo-bativeille.svg` : logo

## Hébergement GitHub Pages

1. Créer un dépôt GitHub.
2. Uploader le contenu de ce dossier.
3. Dans **Settings > Pages**, choisir la branche `main` et le dossier `/root`.
4. Le site sera publié automatiquement.

## Mise à jour automatique des flux

La GitHub Action s’exécute toutes les 3 heures et à chaque push sur `main`.

### Activation

1. Aller dans l’onglet **Actions** du dépôt.
2. Autoriser l’exécution des workflows si GitHub le demande.
3. Le workflow `Update feeds` pourra être lancé manuellement ou automatiquement.

## Ajouter une source

### Depuis l’interface

Utiliser le formulaire “Ajouter une source RSS / site à surveiller”.
Le formulaire génère un bloc JSON à coller dans `sources.json`.

### Format attendu dans `sources.json`

```json
{
  "id": "cerema",
  "name": "Cerema",
  "siteUrl": "https://www.cerema.fr/fr/actualites",
  "rss": null,
  "type": "Institution publique",
  "defaultTags": ["Adaptation climatique", "Bâtiment"],
  "official": true,
  "active": true
}
```


## Collecte automatique V4.3

Le script cherche les publications dans cet ordre :

1. flux RSS/Atom déclarés ou détectés ;
2. API WordPress `/wp-json/wp/v2/posts` quand elle existe ;
3. sitemaps XML (`sitemap.xml`, `sitemap_index.xml`, etc.) ;
4. pages ciblées de type `actualites`, `news`, `publications`, `articles`, `blog`.

La collecte ne scanne pas tout le site : elle reste limitée à des points d’entrée explicites pour éviter le crawl lourd.

Le fichier `feed-status.json` est généré à chaque exécution et indique, source par source, la méthode utilisée ou la raison probable d’absence de résultat.

## Lancer localement

Le site peut être ouvert directement dans un navigateur.

Pour tester la mise à jour automatique :

```bash
npm install
npm run update-feeds
```

## Limites actuelles

- le formulaire d’ajout de source ne modifie pas directement GitHub ;
- la détection de flux côté navigateur est volontairement légère ;
- certains sites sans RSS ou fortement protégés devront être ajoutés manuellement ;
- les résumés “payants” restent à enrichir manuellement si besoin.

## Modifications V3.1

- Logo remplacé par la première proposition retenue : phare + maison + mot-symbole `bativeille`.
- Bloc `Articles à fort impact` retiré de l’interface.
- Tri simplifié : `Plus récent` / `Plus ancien`.
- Le bouton `Lire l’article` pointe vers `item.link` du flux RSS/Atom : il ouvre donc l’article exact quand la source fournit un flux correctement structuré.
- Les cartes peuvent afficher `article.image`.
- Le script de collecte tente d’extraire l’image de l’article depuis :
  - `enclosure` RSS ;
  - balises `media:content` / `media:thumbnail` ;
  - images intégrées dans le contenu du flux ;
  - `og:image` / `twitter:image` de la page article.
- La liste des sources a été enrichie avec les sources institutionnelles, techniques, environnementales, certifications, architecture, observatoires et presse spécialisée fournies.

### Point à vérifier pour les liens exacts

Le site utilise toujours le lien exact fourni par chaque flux RSS/Atom. Pour les sources qui ne proposent pas de flux ou qui ne publient que des liens génériques, il faudra soit :

1. renseigner manuellement un flux fiable dans `sources.json`,
2. ajouter une règle spécifique de scraping,
3. ou créer une entrée manuelle dans `manual_entries.json` avec l’URL exacte.

## V3.2 — profil et favoris classés

Ajouts :

- logo agrandi dans la barre supérieure ;
- bouton de connexion profil ;
- accès aux favoris réservé au profil connecté ;
- accès au formulaire d’ajout de source réservé au profil connecté ;
- gestion de sous-catégories de favoris ;
- création, renommage et suppression de dossiers favoris ;
- drag and drop des articles vers les dossiers favoris ;
- stockage local navigateur via `localStorage`.

### Important sécurité

Cette protection est une protection d’interface côté navigateur, adaptée à un site statique GitHub Pages. Elle masque les fonctions et empêche l’usage courant hors profil, mais ce n’est pas une vraie authentification serveur. Pour une sécurité réelle multi-utilisateurs, il faudra passer à Supabase, Firebase, Netlify Identity ou équivalent.

## V3.9 — menu filtres compact

- La colonne de filtres gauche est maintenant masquée par défaut.
- Une icône **3 tirets** dans la barre supérieure ouvre/ferme le panneau de filtres.
- Les raccourcis Thématiques / Sources / Accès / Date / Tags ouvrent directement le panneau au bon endroit.
- Le contenu principal gagne toute la largeur disponible pour les articles.


## V3.9

- Accueil réinitialise les filtres et revient à l’écran principal.
- Interface favoris compactée.
- Ajout d’un sélecteur mobile “Classer…” pour ranger un article dans un dossier favori.
- Responsive téléphone renforcé : barre haute, filtres, cartes, favoris et sources.


## V3.9

- Logo bativeille agrandi et recadré dans la barre haute.
- Descriptif haut de page retiré.
- Statistiques et textes réduits pour une interface plus légère.
- Bloc Articles à fort impact retiré.


## V3.9 — Observatoires et filtre région

- Ajout des observatoires nationaux du bâtiment, de la rénovation, de la qualité, du bas carbone, de l’urbanisme, de l’énergie-climat et des données de marché.
- Ajout des centres ressources régionaux bâtiment durable, agences d’urbanisme, CERC régionales, observatoires air/climat/déchets quand identifiés.
- Ajout d’un champ `region` dans `sources.json`.
- Ajout d’un filtre Région dans le panneau de filtres.
- Le script GitHub Action propage désormais la région des sources vers les articles récupérés.


## V3.9

- Ajout d’un onglet **Sources suivies** dans la navigation principale.
- Suppression des tuiles sources de la page d’accueil.
- Liste des sources sous forme de tableau compact avec lien direct vers chaque site.
- Recherche et filtre par région dans l’onglet Sources suivies.


## V3.9

- Correction de l'onglet Sources suivies : affichage forcé de la vue dédiée.
- Identifiant/mot de passe local : Admin / Admin.

Note : cette authentification reste un verrouillage d'interface côté navigateur, pas une sécurité serveur.


## Mise a jour automatique

Cette version conserve la mise a jour GitHub Actions toutes les 3 heures (`0 */3 * * *`) et le script RSS ne conserve que les articles dont la date de publication est egale ou posterieure au 2026-07-01. Les flux RSS ne fournissant pas de date exploitable sont ignores pour eviter d'importer des contenus non verifies.


## V4.2 - collecte et workflow renforcés

- Mise à jour automatique conservée toutes les 3 heures (`0 */3 * * *`).
- Le workflow ne masque plus les erreurs de push : si le commit automatique échoue, GitHub Actions l’affichera clairement.
- Le script teste `rss`, `rssCandidates`, les flux détectés dans le HTML et plusieurs chemins RSS standards.
- Si aucun flux RSS n’est exploitable, il tente une détection limitée sur la page d’accueil / actualités de la source, sans crawler tout le site.
- Génération d’un fichier `feed-status.json` pour voir quelles sources ont réellement un flux exploitable.

## V4.4 - Collecte stable

Cette version stabilise la collecte automatique :

- RSS / Atom ;
- API WordPress ;
- sitemap rapide uniquement ;
- aucun scraping massif des pages actualités ;
- timeout court par requête ;
- timeout global du job GitHub Actions à 12 minutes ;
- génération de `feed-status.json` pour diagnostiquer les sources exploitables.

La mise à jour automatique reste configurée toutes les 3 heures (`0 */3 * * *`).



## V4.6 - configuration GitHub Pages stable

Cette version est prévue pour GitHub Pages en mode :

- Settings > Pages > Deploy from a branch
- Branch : main
- Folder : /root

Le workflow `.github/workflows/update-feeds.yml` ne déploie pas Pages directement. Il met uniquement à jour `data.js`, `data.generated.json` et `feed-status.json` toutes les 3 heures ou sur lancement manuel.

Le fichier `.nojekyll` est présent à la racine pour éviter tout traitement Jekyll inutile.


## V4.6

- Fin forcée du script après écriture des fichiers pour éviter que GitHub Actions reste bloqué avant l’étape de commit.
- Log explicite : `Fichiers écrits. Fin du script. Passage au commit GitHub Actions.`
