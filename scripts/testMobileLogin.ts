async function main() {
  const response = await fetch("http://localhost:3000/api/mobile/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: "174",
      pin: "1234",
    }),
  });

  const json = await response.json();
  console.log(json);
}

main().catch((error) => {
  console.error("Request failed:", error);
  process.exit(1);
});
