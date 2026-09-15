import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, collectionGroup } from "firebase/firestore";

const MULTISERVER_FIREBASE_CONFIG = {
  projectId: "ai-studio-applet-webapp-da80e",
  appId: "1:1003173197683:web:7e3b4aa36fa28c8ac13706",
  apiKey: "AIzaSyBlqzME9XchQwSTsOvK9mwtFj8q-8bz4xk",
  authDomain: "ai-studio-applet-webapp-da80e.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-275461e9-2fee-4ae9-a370-41c81e004bf4",
};

const app = initializeApp(MULTISERVER_FIREBASE_CONFIG);
const db = getFirestore(app, MULTISERVER_FIREBASE_CONFIG.firestoreDatabaseId);

async function run() {
  const animeSnap = await getDocs(collection(db, 'anime'));
  console.log("Total anime:", animeSnap.docs.length);
  const franchisesSnap = await getDocs(collection(db, 'franchises'));
  console.log("Total franchises:", franchisesSnap.docs.length);
}
run();
