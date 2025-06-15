let i = 0;

setInterval(() => {
  console.log(process.cwd());
  console.log(++i);
  console.error("This is an error message" + i);
}, 1000);
