(async () => {
  const allowedEmails = new Set(["gwang32b@gmail.com", "kjhung8@gmail.com"]);

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
    alert(`This account is not allowed for seeding: ${user.email}`);
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";

  const file = await new Promise((resolve) => {
    input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });

  if (!file) return;

  const backup = JSON.parse(await file.text());
  const readings = backup?.data?.readings;
  if (!Array.isArray(readings) || readings.length === 0) {
    alert("No readings found in the selected file.");
    return;
  }

  const confirmed = confirm(`${user.email} account will receive ${readings.length} dummy readings. Existing documents with the same dummy IDs will be overwritten. Continue?`);
  if (!confirmed) return;

  const db = firebase.firestore();
  const userRef = db.collection("users").doc(user.uid);
  const readingsRef = userRef.collection("readings");
  const now = new Date().toISOString();
  const chunkSize = 400;

  function cleanReading(reading) {
    return {
      value: Number(reading.value),
      unit: "mg/dL",
      measuredAt: String(reading.measuredAt),
      period: String(reading.period),
      timing: String(reading.timing),
      mealNote: String(reading.mealNote ?? ""),
      exercised: Boolean(reading.exercised),
      medicationTaken: Boolean(reading.medicationTaken),
      memo: String(reading.memo ?? ""),
      createdAt: String(reading.createdAt || now),
      updatedAt: String(reading.updatedAt || now),
    };
  }

  for (let index = 0; index < readings.length; index += chunkSize) {
    const batch = db.batch();
    const chunk = readings.slice(index, index + chunkSize);

    for (const reading of chunk) {
      if (!reading?.id) continue;
      batch.set(readingsRef.doc(String(reading.id)), cleanReading(reading), { merge: true });
    }

    await batch.commit();
    console.log(`Seeded ${Math.min(index + chunk.length, readings.length)} / ${readings.length}`);
  }

  await userRef.collection("meta").doc("sync").set({
    lastSyncedAt: new Date().toISOString(),
    userEmail: user.email || "",
  }, { merge: true });

  alert(`Dummy seeding complete: ${readings.length} readings. Reloading now.`);
  location.reload();
})();