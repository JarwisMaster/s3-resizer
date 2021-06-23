"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({ signatureVersion: "v4" });
const Sharp = require("sharp");
const PathPattern = /(.*\/)?(.*)\/(.*)/;

// parameters
const { BUCKET, URL } = process.env;
const WHITELIST = process.env.WHITELIST
  ? Object.freeze(process.env.WHITELIST.split(" "))
  : null;

exports.handler = async (event) => {
  let path = event.queryStringParameters.path;
  const parts = PathPattern.exec(path);
  const dir = parts[1] || "";
  const resizeOption = parts[2]; // e.g. "150x150_max"
  const params = resizeOption.split("_");
  const filename = parts[3];

  const sizes = params[0].split("x");

  let action = null;
  let format = null;

  if (params.length > 2) {
    action = params[1];
    format = params[2].slice(1);
  } else if (params.length > 1) {
    if (params[1][0] === "-") {
      format = params[1].slice(1);
    } else {
      action = params[1];
    }
  } else {
    action = null;
    format = null;
  }

  // Whitelist validation.
  if (WHITELIST && !WHITELIST.includes(resizeOption)) {
    return {
      statusCode: 400,
      body: `WHITELIST is set but does not contain the size parameter "${resizeOption}"`,
      headers: { "Content-Type": "text/plain" },
    };
  }

  // Action validation.
  if (action && action !== "max" && action !== "min") {
    return {
      statusCode: 400,
      body:
        `Unknown func parameter "${action}"\n` +
        'For query ".../150x150_func", "_func" must be either empty, "_min" or "_max"',
      headers: { "Content-Type": "text/plain" },
    };
  }

  if (
    format &&
    format !== "webp" &&
    format !== "png" &&
    format !== "jpeg" &&
    format !== "avif"
  ) {
    return {
      statusCode: 400,
      body: `Unknown format parameter "${format}"\n`,
      headers: { "Content-Type": "text/plain" },
    };
  }

  if (format) {
    path = path.replace(/\.[^/.]+$/, `.${format}`);
  }

  try {
    const data = await S3.getObject({
      Bucket: BUCKET,
      Key: dir + filename,
    }).promise();

    const width = sizes[0] === "AUTO" ? null : parseInt(sizes[0]);
    const height = sizes[1] === "AUTO" ? null : parseInt(sizes[1]);
    let fit;
    switch (action) {
      case "max":
        fit = "inside";
        break;
      case "min":
        fit = "outside";
        break;
      default:
        fit = "cover";
        break;
    }

    let result = null;

    if (format) {
      result = await Sharp(data.Body, { failOnError: false })
        .resize(width, height, { withoutEnlargement: true, fit })
        .rotate()
        [format]()
        .toBuffer();
    } else {
      result = await Sharp(data.Body, { failOnError: false })
        .resize(width, height, { withoutEnlargement: true, fit })
        .rotate()
        .toBuffer();
    }

    await S3.putObject({
      Body: result,
      Bucket: BUCKET,
      ContentType: data.ContentType,
      Key: path,
      CacheControl: "public, max-age=86400",
    }).promise();

    return {
      statusCode: 301,
      headers: { Location: `${URL}/${path}` },
    };
  } catch (e) {
    return {
      statusCode: e.statusCode || 400,
      body: "Exception: " + e.message,
      headers: { "Content-Type": "text/plain" },
    };
  }
};
