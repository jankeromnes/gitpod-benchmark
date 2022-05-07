const fs = require("fs");
const http = require("http");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const db = JSON.parse(fs.readFileSync("./db.json", "utf-8"));
const builds = {};
let resolve;
let serverUrl;

const randomHex = (size) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

const rebaseUpstream = async (repoUrl) => {
    const id = "rebase-" + randomHex(6);
    await exec(`git clone ${repoUrl} /tmp/${id} &&
    cd /tmp/${id} &&
    ./rebase-upstream.sh &&
    cd - &&
    rm -rf /tmp/${id}`);
}

const buildWorkspace = async (repoUrl) => {
    const id = "workspace-" + randomHex(6);
    builds[id] = { repoUrl, dataset: "workspace" };
    await exec(`gp preview https://gitpod.io/#BUILD_ID=${id},SERVER_URL=${encodeURIComponent(serverUrl)}/${repoUrl} --external`);
    builds[id].init = Date.now();
};

const buildPrebuild = async (repoUrl) => {
    const id = "prebuild-" + randomHex(6);
    builds[id] = { repoUrl, dataset: "prebuild" };
    await exec(`git clone ${repoUrl} /tmp/${id} &&
    cd /tmp/${id} &&
    git checkout -b prebuild &&
    printf "tasks:\n  - prebuild: BUILD_ID=${id} SERVER_URL=${serverUrl} ./gitpod-benchmark.sh\ngithub:\n  prebuilds:\n    branches: true\n" > .gitpod.yml &&
    git commit -am "Run ${id}" &&
    git push -f origin prebuild &&
    cd - &&
    rm -rf /tmp/${id}`);
    builds[id].init = Date.now();
}

const buildLocal = async (repoUrl) => {
    const id = "local-" + randomHex(6);
    builds[id] = { repoUrl, dataset: "local" };
    console.log(`Please run this locally:
    curl -k "${serverUrl}/init?id=${id}" &&
    git clone ${repoUrl} /tmp/${id} &&
    cd /tmp/${id} &&
    BUILD_ID=${id} SERVER_URL=${serverUrl} ./gitpod-benchmark.sh &&
    cd - &&
    rm -rf /tmp/${id}`);
}

const saveBuild = async (build) => {
    const repo = db.repositories[build.repoUrl];
    if (!repo.datasets) {
        repo.datasets = { workspace: [], prebuild: [], local: [] };
    }
    repo.datasets[build.dataset].push({
        x: build.init,
        start: build.start - build.init,
        build: build.stop - build.start,
    });
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
        saveBuild(builds[params.id]);
        delete builds[params.id];
        if (Object.keys(builds).length === 0) {
            // This was the last build, save DB to disk
            fs.writeFileSync("./db.json", JSON.stringify(db, null, 4), "utf-8");
            console.log("All done!");
        }
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

    for (const repoUrl in db.repositories) {
        await rebaseUpstream(repoUrl);
        await buildWorkspace(repoUrl);
        await buildPrebuild(repoUrl);
        await buildLocal(repoUrl);
    }
});
