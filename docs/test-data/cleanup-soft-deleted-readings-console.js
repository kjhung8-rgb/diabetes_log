(async () => {
  const allowedEmails = new Set(["gwang32b@gmail.com", "kjhung8@gmail.com"]);
  const retentionDays = 14;
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
    alert(`This account is not allowed for cleanup: ${user.email}`);
    return;
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const typed = prompt(`This will permanently delete soft-deleted readings older than ${retentionDays} days from ${user.email}.\n\nCutoff: ${cutoff}\n\nType CLEAN DELETED to continue.`);
  if (typed !== "CLEAN DELETED") {
    alert("Cancelled. No data was deleted.");
    return;
  }

  const db = firebase.firestore();
  const userRef = db.collection("users").doc(user.uid);
  const readingsRef = userRef.collection("readings");

  const snapshot = await readingsRef.where("isDeleted", "==", true).get();
  const oldDeletedDocs = snapshot.docs.filter((doc) => {
    const deletedAt = doc.data()?.deletedAt;
    if (typeof deletedAt !== "string") return false;

    const deletedTime = new Date(deletedAt).getTime();
    const cutoffTime = new Date(cutoff).getTime();
    return Number.isFinite(deletedTime) && deletedTime <= cutoffTime;
  });

  let deletedCount = 0;
  for (let index = 0; index < oldDeletedDocs.length; index += batchSize) {
    const batch = db.batch();
    const chunk = oldDeletedDocs.slice(index, index + batchSize);

    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deletedCount += chunk.length;
    console.log(`Cleaned ${deletedCount} / ${oldDeletedDocs.length} old soft-deleted readings`);
  }

  await userRef.collection("meta").doc("sync").set({
    lastCleanupAt: new Date().toISOString(),
    cleanupRetentionDays: retentionDays,
    cleanupCutoff: cutoff,
    userEmail: user.email || "",
  }, { merge: true });

  const recentDeletedCount = snapshot.size - oldDeletedDocs.length;
  alert(`Cleanup complete.\nSoft-deleted docs scanned: ${snapshot.size}\nPermanently deleted: ${deletedCount}\nKept because newer than ${retentionDays} days: ${recentDeletedCount}`);
})();