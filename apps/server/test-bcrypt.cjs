try {
  const bcrypt = require("bcrypt");
  bcrypt.hash("test", 1).then(h => {
    console.log("bcrypt OK");
    process.exit(0);
  }).catch(e => {
    console.log("bcrypt ERROR:", e.message);
    process.exit(1);
  });
} catch(e) {
  console.log("bcrypt LOAD ERROR:", e.message);
  process.exit(1);
}
