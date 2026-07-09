(async () => {
  const allowedEmails = new Set(["gwang32b@gmail.com", "kjhung8@gmail.com"]);
  const dummyPrefix = "dummy-";
  const batchSize = 400;

  if (!window.firebase?.auth || !window.firebase?.firestore) {
    alert("Firebase SDK is not loaded. Run this on the deployed glucose log page.");
    return;
  }

  const user = firebase.auth().currentUser;
  if (!user) {
    alert("Log in first, then run this script again.");
    return;
  }

  if (!allowedEmails.has(user.email)) {
    alert(`This account is not allowed for dummy deletion: ${user.email}`);
    return;
  }

  const typed = prompt(`This will delete Firestore and local IndexedDB readings whose IDs start with "${dummyPrefix}" from ${user.email}.\n\nType DELETE DUMMY to continue.`);
  if (typed !== "DELETE DUMMY") {
    alert("Cancelled. No data was deleted.");
    return;
  }

  const db = firebase.firestore();
  const userRef = db.collection("users").doc(user.uid);
  const readingsRef = userRef.collection("readings");
  const documentId = firebase.firestore.FieldPath.documentId();
  let deletedFromCloud = 0;

  while (true) {
    const snapshot = await readingsRef
      .orderBy(documentId)
      .startAt(dummyPrefix)
      .endAt(`${dummyPrefix}\uf8ff`)
      .limit(batchSize)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deletedFromCloud += snapshot.size;
    console.log(`Deleted ${deletedFromCloud} dummy Firestore readings`);
  }

  await userRef.collection("meta").doc("sync").set({
    lastSyncedAt: new Date().toISOString(),
    userEmail: user.email || "",
  }, { merge: true });

  async function deleteLocalDummyReadings() {
    if (!window.indexedDB) return 0;

    const databaseName = "glucose-log-db";
    const storeName = "readings";

    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!database.objectStoreNames.contains(storeName)) {
      database.close();
      return 0;
    }

    const deletedCount = await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.openCursor();
      let count = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;

        const id = String(cursor.key || cursor.value?.id || "");
        if (id.startsWith(dummyPrefix)) {
          cursor.delete();
          count += 1;
        }
        cursor.continue();
      };

      transaction.oncomplete = () => resolve(count);
      transaction.onerror = () => reject(transaction.error);
    });

    database.close();
    return deletedCount;
  }

  let deletedFromLocal = 0;
  try {
    deletedFromLocal = await deleteLocalDummyReadings();
  } catch (error) {
    console.warn("Local IndexedDB dummy deletion failed", error);
  }

  alert(`Dummy deletion complete.\nFirestore deleted: ${deletedFromCloud}\nLocal deleted: ${deletedFromLocal}\nReloading now.`);
  location.reload();
})();