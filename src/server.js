import * as sapper from "@sapper/server";
import OAuth from "oauth-1.0a";
import compression from "compression";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import express from "express";
import request from "request";
import sirv from "sirv";

const { PORT, NODE_ENV, TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET } = process.env;
const dev = NODE_ENV === "development";

const p = x => { console.log(x); return x; };

const oauth = OAuth({
  consumer: { key: TWITTER_CONSUMER_KEY, secret: TWITTER_CONSUMER_SECRET },
  signature_method: "HMAC-SHA1",
  hash_function(base_string, key) {
    return crypto.createHmac("sha1", key).update(base_string).digest("base64");
  },
});

const postWithSignature = (data, callback) => {
  data.method = "POST";
  return request(
    { url: data.url, method: data.method, form: oauth.authorize(data) },
    callback
  );
};

express()
  .use(cookieParser())
  .get("/oauth", (req, res) => {
    postWithSignature({
      url: "https://api.twitter.com/oauth/access_token",
      data: req.query,
    }, (error, response, body) => {
      const token = JSON.stringify({
        key: body.match(/oauth_token=([\w-]+)/)[1],
        secret: body.match(/oauth_token_secret=([\w-]+)/)[1],
      });
      res.cookie("oauth_token", token, { maxAge: 2147483647, httpOnly: true });
      res.redirect("/");
    });
  })
  .get("/login", (req, res) => {
    postWithSignature({
      url: "https://api.twitter.com/oauth/request_token",
      oauth_callback: dev ? "http://localhost:5000/oauth" : "https://findtweets.herokuapp.com/oauth",
    }, (error, response, body) => {
      const token = body.match(/oauth_token=([\w-]+)/)[1];
      res.redirect(`https://api.twitter.com/oauth/authenticate?oauth_token=${token}`);
    });
  })
  .all(/^\/api\/.+/, (req, res) => {
    const data = {
      method: req.method,
      url: `https://api.twitter.com/1.1/${req.path.slice("/api/".length)}`,
    };
    const { key, secret } = JSON.parse(req.cookies.oauth_token);
    request(
      {
        url: data.url,
        qs: req.query,
        method: data.method,
        oauth: {
          consumer_key: TWITTER_CONSUMER_KEY,
          consumer_secret: TWITTER_CONSUMER_SECRET,
          token: key,
          token_secret: secret,
        },
      },
      (error, response, body) => {
        res.statusCode = response.statusCode;
        res.end(body);
      });
  })
  .use(
    compression({ threshold: 0 }),
		sirv("static", { dev }),
		sapper.middleware()
	)
	.listen(PORT, err => {
		if (err) console.log("error", err);
	});
