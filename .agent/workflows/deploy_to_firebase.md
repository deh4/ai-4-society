---
description: How to deploy the AI 4 Society app to Firebase Hosting
---

# Deploy to Firebase Hosting

This workflow guides you through manually deploying the application to Firebase.

1.  **Install Firebase Tools** (if you haven't already):
    ```bash
    npm install -g firebase-tools
    ```

2.  **Login to Firebase**:
    ```bash
    firebase login
    ```
    *Follow the browser prompt to authenticate.*

3.  **Initialize Firebase**:
    Run the initialization command in the project root:
    ```bash
    firebase init hosting
    ```
    **Select the following options:**
    *   **Project**: Select "Use an existing project" (or create a new one if you haven't yet).
    *   **Public directory**: Type `dist` (Vite's build output folder).
    *   **Configure as a single-page app?**: `Yes` (Important for React Router).
    *   **Set up automatic builds and deploys with GitHub?**: `No` (for now, unless you want CI/CD).
    *   **File dist/index.html already exists. Overwrite?**: `No`.

4.  **Build the Project**:
    Ensure you have the latest production build:
    ```bash
    // turbo
    npm run build
    ```

5.  **Deploy**:
    Push the `dist` folder to Firebase:
    ```bash
    firebase deploy --only hosting
    ```

6.  **Verify**:
    Firebase will output a `Hosting URL`. Click it to verify your live site.
