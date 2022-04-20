const fs = require("fs");
const http = require("http");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const db = JSON.parse(fs.readFileSync("./db.json", "utf-8"));
const jobs = {};

http.Server(async (req, res) => {
    const [path, query] = req.url.split("?");
    const params = Object.fromEntries(query ? query.split("&").map(q => q.split("=")) : []);

    if (path === "/start" && params.id && !jobs[params.id]) {
        jobs[params.id] = Date.now();
        res.writeHead(200);
        res.end("Started");
        return;
    }

    if (path === "/stop" && params.id && jobs[params.id]) {
        console.log(params.id, "took", Date.now() - jobs[params.id]);
        delete jobs[params.id];
        res.writeHead(200);
        res.end("Stopped");
        return;
    }

    res.writeHead(400);
    res.end("Bad Request");

}).listen(1337, async () => {
    const url = (await exec("gp url 1337")).stdout.trim();
    console.log("Listening!");
    console.log(`Run this locally:
    git clone https://github.com/spring-projects/spring-petclinic &&
    cd spring-petclinic &&
    curl -k ${url}/start?id=abc &&
    ./mvnw package -DskipTests &&
    curl -k ${url}/stop?id=abc &&
    cd .. &&
    rm -rf spring-petclinic`);
});
