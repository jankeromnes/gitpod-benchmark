const fs = require("fs");
const http = require("http");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const db = JSON.parse(fs.readFileSync("./db.json", "utf-8"));
const jobs = {};
let resolve;

const randomHex = (size) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
const gitpodBuild = async (id, repoUrl, serverUrl) => {
    await exec(`gp preview https://gitpod.io/#BUILD_ID=${id},SERVER_URL=${encodeURIComponent(serverUrl)}/${repoUrl} --external`);
};
const localBuild = async (id, repoUrl, serverUrl) => {
    console.log(`Please run this locally:
    git clone ${repoUrl} /tmp/${id} &&
    cd /tmp/${id} &&
    BUILD_ID=${id} SERVER_URL=${serverUrl} ./gitpod-benchmark.sh &&
    rm -rf /tmp/${id}`);
}

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
    const serverUrl = (await exec("gp url 1337")).stdout.trim();

    // Make sure we can open new tabs
    const tested = new Promise(r => { resolve = r });
    await exec(`gp preview ${serverUrl}/test --external`);
    console.log(`Please "Allow pop-ups for ${serverUrl.replace("https://1337-", "")}"...`);
    await tested;
    console.log("Done\n");

    await localBuild(randomHex(4), "https://github.com/jankeromnes/gitpod-benchmark-spring-petclinic", serverUrl);
    await gitpodBuild(randomHex(4), "https://github.com/jankeromnes/gitpod-benchmark-spring-petclinic", serverUrl);
});
