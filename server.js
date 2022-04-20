const fs = require("fs");
const http = require("http");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const db = JSON.parse(fs.readFileSync("./db.json", "utf-8"));
const jobs = {};
let resolve;

http.Server(async (req, res) => {
    const [path, query] = req.url.split("?");
    const params = Object.fromEntries(query ? query.split("&").map(q => q.split("=")) : []);

    if (path === "/test") {
        if (resolve) resolve();
        res.writeHead(200);
        res.end("Success! You can close this tab now.\n");
        return;
    }

    if (path === "/start" && params.id && !jobs[params.id]) {
        jobs[params.id] = Date.now();
        res.writeHead(200);
        res.end("Started\n");
        return;
    }

    if (path === "/stop" && params.id && jobs[params.id]) {
        console.log(params.id, "took", Date.now() - jobs[params.id]);
        delete jobs[params.id];
        res.writeHead(200);
        res.end("Stopped\n");
        return;
    }

    res.writeHead(400);
    res.end("Bad Request\n");

}).listen(1337, async () => {
    const url = (await exec("gp url 1337")).stdout.trim();

    // Make sure we can open new tabs
    const tested = new Promise(r => { resolve = r });
    await exec(`gp preview ${url}/test --external`);
    console.log(`Please "Allow pop-ups for ${url.replace("https://1337-", "")}"...`);
    await tested;
    console.log("Done\n");

    console.log(`Please run this locally:
    git clone https://github.com/spring-projects/spring-petclinic &&
    cd spring-petclinic &&
    curl -k ${url}/start?id=abc &&
    ./mvnw package -DskipTests &&
    curl -k ${url}/stop?id=abc &&
    cd .. &&
    rm -rf spring-petclinic`);
});
