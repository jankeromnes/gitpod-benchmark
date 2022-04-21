const fs = require("fs");
const http = require("http");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const db = JSON.parse(fs.readFileSync("./db.json", "utf-8"));
const builds = {};
let resolve;
let serverUrl;

const randomHex = (size) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
const newBuild = (repoUrl) => {
    const id = randomHex(8);
    builds[id] = { id, repository: repoUrl };
    return builds[id];
}
const gitpodBuild = async (repoUrl) => {
    const build = newBuild(repoUrl);
    await exec(`gp preview https://gitpod.io/#BUILD_ID=${build.id},SERVER_URL=${encodeURIComponent(serverUrl)}/${repoUrl} --external`);
    build.init = Date.now();
};
const localBuild = async (repoUrl) => {
    const build = newBuild(repoUrl);
    console.log(`Please run this locally:
    curl -k ${serverUrl}/init?id=${build.id} &&
    git clone ${repoUrl} /tmp/${build.id} &&
    cd /tmp/${build.id} &&
    BUILD_ID=${build.id} SERVER_URL=${serverUrl} ./gitpod-benchmark.sh &&
    cd - &&
    rm -rf /tmp/${build.id}`);
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

    if (path === "/init" && params.id && builds[params.id] && !builds[params.id].init) {
        builds[params.id].init = Date.now();
        res.writeHead(200);
        res.end("Build Initialized\n");
        return;
    }

    if (path === "/start" && params.id && builds[params.id] && !builds[params.id].start) {
        builds[params.id].start = Date.now();
        res.writeHead(200);
        res.end("Build Started\n");
        return;
    }

    if (path === "/stop" && params.id && builds[params.id] && !builds[params.id].stop) {
        builds[params.id].stop = Date.now();
        console.log(params.id, "took", builds[params.id].stop - builds[params.id].start);
        delete builds[params.id];
        res.writeHead(200);
        res.end("Build Stopped\n");
        return;
    }

    res.writeHead(400);
    res.end("Bad Request\n");

}).listen(1337, async () => {
    serverUrl = (await exec("gp url 1337")).stdout.trim();

    // Make sure we can open new tabs
    const tested = new Promise(r => { resolve = r });
    await exec(`gp preview ${serverUrl}/test --external`);
    console.log(`Please "Allow pop-ups for ${serverUrl.replace("https://1337-", "")}"...`);
    await tested;
    console.log("Done\n");

    await localBuild("https://github.com/jankeromnes/gitpod-benchmark-spring-petclinic");
    await gitpodBuild("https://github.com/jankeromnes/gitpod-benchmark-spring-petclinic");
    await localBuild("https://github.com/jankeromnes/gitpod-benchmark-nushell");
    await gitpodBuild("https://github.com/jankeromnes/gitpod-benchmark-nushell");
});
