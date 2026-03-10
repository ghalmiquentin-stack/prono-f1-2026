# Prono F1 2026 — Setup Guide

Ce guide explique comment mettre en ligne l'application **Prono F1 2026** pour que les 4 joueurs puissent y accéder 24h/7j.

---

## Étape 1 — Créer un compte GitHub et pousser le projet

### 1.1 Créer un compte GitHub
1. Va sur [github.com](https://github.com) → clique **Sign up**
2. Choisis un nom d'utilisateur, entre ton email et un mot de passe
3. Vérifie ton email

### 1.2 Créer un nouveau repository
1. Sur GitHub, clique le **+** en haut à droite → **New repository**
2. Nom du repo : `prono-f1-2026`
3. Laisse-le **Public** (nécessaire pour Vercel gratuit)
4. Ne coche rien (pas de README, .gitignore, ni licence) → **Create repository**

### 1.3 Pousser le code depuis ton terminal
```bash
cd "/Users/quentin/F1 prono"

# Initialiser git
git init
git add .
git commit -m "Initial commit — Prono F1 2026"

# Connecter à GitHub (remplace TON_USERNAME par ton pseudo GitHub)
git remote add origin https://github.com/TON_USERNAME/prono-f1-2026.git
git branch -M main
git push -u origin main
```

> Si git te demande tes identifiants, entre ton pseudo GitHub et un **Personal Access Token** (Settings → Developer settings → Personal access tokens → Generate new token, avec les droits `repo`).

---

## Étape 2 — Créer un projet Firebase et configurer Firestore

### 2.1 Créer un projet Firebase
1. Va sur [console.firebase.google.com](https://console.firebase.google.com)
2. Clique **Créer un projet** (ou Add project)
3. Nom : `prono-f1-2026`
4. Désactive Google Analytics si tu veux (pas nécessaire) → **Créer le projet**

### 2.2 Activer Firestore
1. Dans le menu gauche → **Build** → **Firestore Database**
2. Clique **Créer une base de données**
3. Choisis **Mode production** → **Suivant**
4. Choisis la région **europe-west3 (Frankfurt)** → **Activer**

### 2.3 Configurer les règles Firestore
Dans **Firestore → Onglet Règles**, colle ceci et clique **Publier** :
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 2.4 Récupérer les credentials Firebase
1. Dans la console Firebase → **Paramètres du projet** (icône engrenage) → **Général**
2. Scroll vers le bas → **Tes applications** → clique **</>** (Web)
3. Nom : `prono-f1-2026-web` → **Enregistrer l'application**
4. Copie le bloc `firebaseConfig` affiché

---

## Étape 3 — Déployer sur Vercel

### 3.1 Créer un compte Vercel
1. Va sur [vercel.com](https://vercel.com) → **Sign Up**
2. Clique **Continue with GitHub** → autorise Vercel sur ton compte GitHub

### 3.2 Importer le projet
1. Sur ton dashboard Vercel → **Add New Project**
2. Clique **Import** sur le repo `prono-f1-2026`
3. Framework Preset : **Vite** (détecté automatiquement)
4. **NE PAS déployer encore** — il faut d'abord ajouter les variables d'environnement

### 3.3 Ajouter les variables d'environnement
Dans la section **Environment Variables** avant de déployer, ajoute ces 6 variables (valeurs depuis ton firebaseConfig) :

| Variable | Valeur |
|----------|--------|
| `VITE_FIREBASE_API_KEY` | ta valeur `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | ta valeur `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | ta valeur `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | ta valeur `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ta valeur `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | ta valeur `appId` |

### 3.4 Déployer
1. Clique **Deploy**
2. Attends 1-2 minutes
3. Vercel te donne une URL du type `https://prono-f1-2026.vercel.app` → **c'est l'URL de l'app !**

Partage cette URL aux 4 joueurs. Vercel redéploie automatiquement à chaque `git push`.

---

## Étape 4 — Initialiser les données

1. Ouvre l'app sur ton téléphone ou navigateur
2. Sélectionne ton joueur sur l'écran d'accueil
3. Va sur l'onglet **⚙️ Administration**
4. Saisis le mot de passe admin : `f1paris2026`
5. Clique **"Initialiser les données"** → cela peuple Firestore avec les 23 courses et les données de la course 1 (Australie)

---

## Développement local (optionnel)

```bash
# Copier les variables d'environnement
cp .env.example .env
# Édite .env et remplis les valeurs Firebase

# Installer les dépendances
npm install

# Lancer en dev
npm run dev
# → http://localhost:5173
```

---

## Joueurs & Couleurs

| Joueur  | Couleur   | Avatar |
|---------|-----------|--------|
| William | `#3B82F6` | 🏎️    |
| Quentin | `#22C55E` | 🏁    |
| Alex    | `#F97316` | 🔥    |
| Romain  | `#A855F7` | ⚡    |

Mot de passe admin : **`f1paris2026`**

---

## Système de points

| Événement                         | Points   |
|-----------------------------------|----------|
| Position exacte (P1/P2/P3)        | **+10**  |
| Pilote sur podium, mauvaise pos.  | **+3**   |
| Pilote hors podium                | 0        |
| Bonus Podium Parfait (3 exactes)  | **+5**   |
| Bonus Série de 3 (meilleure fenêtre 3 courses consécutives) | **+10** |
| Pénalité soumission tardive       | **-10**  |
| Pénalité changement de prono      | **-5**   |

Le score ne peut jamais être négatif (minimum 0).
