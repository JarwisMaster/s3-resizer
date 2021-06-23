const { handler } = require("./index");

handler({
  queryStringParameters: {
    path: "tasks/150x150_min_-webp/image.png",
  },
}).then((res) => {
  console.log(res);
}).catch((e) => {
    console.log(e)
})
