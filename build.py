# Compresses the game into a single html file for distribution
import os, bs4, re
import base64, gzip
import mimetypes
import logging
import time


class ColorFilter(logging.Filter):
    def filter(self, record):
        colors = {
            10: "\x1b[2m",  # DEBUG
            20: "\x1b[36m",  # INFO
            30: "\x1b[33m",  # WARNING
            40: "\x1b[31m",  # ERROR
            50: "\x1b[1;41m",  # CRITICAL
        }
        brightcolors = {
            10: "\x1b[37;1m",  # DEBUG
            20: "\x1b[96;1m",  # INFO
            30: "\x1b[93;1m",  # WARNING
            40: "\x1b[91;1m",  # ERROR
            50: "\x1b[91;1m",  # CRITICAL
        }
        record.color = colors.get(record.levelno, "")
        record.brightcolor = brightcolors.get(record.levelno, "")
        return True

logging.getLogger().addFilter(ColorFilter())
logging.basicConfig(
    format="\x1b[2m[\x1b[3m%(asctime)s\x1b[23m]\x1b[0m%(color)s %(brightcolor)s[%(levelname)s]\x1b[0m%(color)s %(message)s\x1b[0m",
    level=logging.INFO,
    datefmt="%Y-%m-%d %H:%M:%S",
)


def convert_to_data_uri(file_path):
    mime_type, _ = mimetypes.guess_type(file_path)
    with open(file_path, "rb") as f:
        data = f.read()
    encoded_data = base64.b64encode(data).decode("utf-8")
    return f"data:{mime_type};base64,{encoded_data}"


def convert_to_data_uri_string(file_content: str, mime_type: str):
    encoded_data = base64.b64encode(file_content.encode("utf-8")).decode("utf-8")
    return f"data:{mime_type};base64,{encoded_data}"


def replace_in_build(data: str):
    html_comment_pattern = re.compile(r"<!-- replace-in-build (.*?)->(.*?) -->")
    generic_pattern = re.compile(r"\/\* replace-in-build (.*?)->(.*?) \*\/")
    remove_in_build_pattern = re.compile(r"\/\* remove-in-build \*\/")
    html_remove_in_build_pattern = re.compile(r"<!-- remove-in-build -->")
    while True:
        match = None
        for pattern in [
            generic_pattern,
            html_comment_pattern,
            remove_in_build_pattern,
            html_remove_in_build_pattern,
        ]:
            match = pattern.search(data)
            if match:
                break
        if not match:
            break
        line_start = data.rfind("\n", 0, match.start()) + 1
        line_end = data.find("\n", match.end())
        if line_end == -1:
            line_end = len(data)
        if "remove-in-build" in match.group(0):
            line = data[line_start:line_end]
            logging.debug(f"Removing in build: '{line}'")
            data = data.replace(line, "")
            continue
        logging.debug(
            f"Replacing in build: '{match.group(1)}' with '{match.group(2)}'"
        )
        line = data[line_start:line_end]
        data = data.replace(
            line,
            line.replace(match.group(0), "").replace(match.group(1), match.group(2)),
        )
    return data


def inline_resources(data: str, base: str):
    html_comment_pattern = re.compile(r"<!-- inline-content '(.*?)' file: (.*?) -->")
    generic_pattern = re.compile(r"\/\* inline-content '(.*?)' file: (.*?) \*\/")
    while True:
        match = None
        for pattern in [generic_pattern, html_comment_pattern]:
            match = pattern.search(data)
            if match:
                break
        if not match:
            break
        # find the line containing the match
        line_start = data.rfind("\n", 0, match.start()) + 1
        line_end = data.find("\n", match.end())
        if line_end == -1:
            line_end = len(data)
        line = data[line_start:line_end]
        assert (
            match.group(1) in line
        ), f"Expected identifier '{match.group(1)}' not found in line: {line.strip()}"
        file_path = os.path.join(base, match.group(2))
        logging.debug(f"Processing inline content for file: {file_path}")
        if os.path.exists(file_path):
            if file_path.endswith((".js", ".css", ".ts", ".html", ".json")):
                with open(file_path, "r", encoding="utf-8") as f:
                    file_content = f.read()
                file_content = replace_in_build(file_content)
                file_content = inline_resources(file_content, base)
                logging.debug(f"Inlined {file_path} with content length {len(file_content)}")
                mime_type, _ = mimetypes.guess_type(file_path)
                data_uri = convert_to_data_uri_string(file_content, mime_type)
            else:
                logging.debug(f"Inlining binary file {file_path} as data URI")
                data_uri = convert_to_data_uri(file_path)
            data = data.replace(
                line, line.replace(match.group(0), "").replace(match.group(1), data_uri)
            )
        else:
            logging.error(f"File not found: {file_path}")
            break
    return data


def convert_html_to_page(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    soup = bs4.BeautifulSoup(content, "html.parser")
    # extract important head elements
    head = soup.head
    important_head = []
    for element in head.children:
        if isinstance(element, bs4.element.Comment):
            # Append comment to the previous tag if there is one (keeps them on the same line)
            comment_str = f"<!--{element}-->"
            if important_head:
                important_head[-1] += f" {comment_str}"
            else:
                important_head.append(comment_str)
        elif isinstance(element, bs4.element.Tag) and element.name in [
            "meta",
            "link",
            "style",
        ]:
            important_head.append(str(element))
        elif isinstance(element, bs4.element.NavigableString):
            text = str(element).strip()
            if text:
                important_head.append(text)
    important_head = "\n".join(important_head)
    body = soup.body
    return str(body), important_head


def combine_pages(
    title: str,
    menu: str,
    menu_head: str,
    game: str,
    game_head: str,
    *,
    compression_enabled=True
):
    if compression_enabled:
        logging.info("Compressing menu content...")
        menu = base64.b64encode(gzip.compress(menu.encode("utf-8"))).decode("utf-8")
        logging.info("Compressing menu head...")
        menu_head = base64.b64encode(gzip.compress(menu_head.encode("utf-8"))).decode(
            "utf-8"
        )
        logging.info("Compressing game content...")
        game = base64.b64encode(gzip.compress(game.encode("utf-8"))).decode("utf-8")
        logging.info("Compressing game head...")
        game_head = base64.b64encode(gzip.compress(game_head.encode("utf-8"))).decode(
            "utf-8"
        )
    else:
        logging.warning("Skipping compression as per options")
        menu = base64.b64encode(menu.encode("utf-8")).decode("utf-8")
        menu_head = base64.b64encode(menu_head.encode("utf-8")).decode("utf-8")
        game = base64.b64encode(game.encode("utf-8")).decode("utf-8")
        game_head = base64.b64encode(game_head.encode("utf-8")).decode("utf-8")
    NAVIGATION_SCRIPT = (
        """
    <script>
        let documents = {
            '/index.html': ["{menu}", "{menu_head}"],
            '/game.html': ["{game}", "{game_head}"]
        };
        const COMPRESSION_ENABLED = {compression_enabled};
        if (!COMPRESSION_ENABLED) {
            console.warn('No compression, will not auto-update');
        }
        function executeScripts(container) {
            const scripts = container.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                // Copy all attributes
                for (const attr of oldScript.attributes) {
                    newScript.setAttribute(attr.name, attr.value);
                }
                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
        }
        async function checkForUpdates() {
            if (!COMPRESSION_ENABLED) return;
            try {
                const response = await fetch("{AUTO_UPDATE_URL}");
                if (!response.ok) {
                    throw new Error(`Failed to check for updates: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                const assets = data["assets"] ?? [];
                const indexAsset = assets.find(asset => asset.name === "index.html")["url"];
                const indexResponse = await fetch(indexAsset, {
                    headers: {
                        "Accept": "application/octet-stream"
                    },
                    // Allow redirects in case the asset URL is a redirect (e.g. GitHub's CDN)
                    redirect: "follow",
                    cors: "cors"
                });
                if (!indexResponse.ok) {
                    throw new Error(`Failed to download update: ${indexResponse.status} ${indexResponse.statusText}`);
                }
                const updatedContent = await indexResponse.text();
                // const match = /&lt;script>\\s*(let|const) documents = {\\s*'\\/index\\.html':\\s*\\["(.*?)", "(.*?)"\\],\\s*'\\/game\\.html':\\s*\\["(.*?)", "(.*?)"\\]/gm.exec(updatedContent);
                if (match) {
                    const [_, __, newMenu, newMenuHead, newGame, newGameHead] = match;
                    documents['/index.html'] = [newMenu, newMenuHead];
                    documents['/game.html'] = [newGame, newGameHead];
                    console.log('Content updated from latest release');
                } else {
                    throw new Error('Failed to parse updated content');
                }
            } catch (err) {
                console.error('Error checking for updates:', err);
            }
        }
        async function decompressAndDecode(data, onProgress) {
            const compressedData = Uint8Array.fromBase64(data);
            if (!COMPRESSION_ENABLED) {
                return new TextDecoder().decode(compressedData);
            }
            const total = compressedData.length;
            let loaded = 0;
            const counter = new TransformStream({
                transform(chunk, controller) {
                    loaded += chunk.byteLength;
                    onProgress?.(loaded / total);
                    controller.enqueue(chunk);
                }
            });
            const blob = new Blob([compressedData], { type: 'application/gzip' });
            const ds = new DecompressionStream("gzip");
            const decompressedStream = blob.stream().pipeThrough(counter).pipeThrough(ds);
            return await new Response(decompressedStream).text();
        }
        function onHashChange() {
            loader.style.display = 'block';
            loader.textContent = 'Loading...';
            loaderBg.style.display = 'block';
            const hash = window.location.hash.substring(1);
            if (!hash) {
                window.location.hash = '/index.html';
                return;
            }
            const [content, head] = documents[hash] ?? [null, null];
            if (!content || !head) {
                console.error(`No content found for hash: ${hash}`);
                document.getElementById('content').innerHTML = '<h1>404 Not Found</h1><p>The requested page could not be found.</p><a href="#/index.html" style="color:#48f">Go back to menu</a>';
                document.getElementById('head-content').innerHTML = '';
                loader.style.display = 'none';
                loaderBg.style.display = 'none';
                return;
            }
            let progress = 0;
            let headProgress = 0;
            let contentProgress = 0;
            const loading = [
                decompressAndDecode(head, progress => {
                    headProgress = progress;
                }).then(decompressedHead => {
                    document.getElementById('head-content').innerHTML = decompressedHead;
                    executeScripts(document.getElementById('head-content'));
                }),
                decompressAndDecode(content, progress => {
                    contentProgress = progress;
                }).then(decompressedContent => {
                    document.getElementById('content').innerHTML = decompressedContent;
                    executeScripts(document.getElementById('content'));
                }),
                new Promise(resolve => {
                    const observer = new PerformanceObserver((list) => {
                        list.getEntries().forEach((entry) => {
                            if (entry.name === 'first-contentful-paint') {
                                resolve();
                                observer.disconnect();
                            }
                        });
                    });
                    observer.observe({ type: "paint", buffered: true });
                }),
                new Promise(resolve => {
                    const interval = setInterval(() => {
                        const overallProgress = (headProgress + contentProgress) / 2;
                        loader.textContent = `Loading... ${Math.floor(overallProgress * 100)}%`;
                        if (overallProgress >= 1) {
                            clearInterval(interval);
                            resolve();
                        }
                    }, 100);
                }),
            ];
            Promise.all(loading).then(() => {
                console.log(`Loaded content for ${hash || '/index.html'}`);
                loader.style.display = 'none';
                loaderBg.style.display = 'none';
            }).catch((err) => {
                console.error('Error loading content:', err);
                alert('An error occurred while loading the page. Please try refreshing or check the console for details.');
            });
        }
        window.addEventListener('hashchange', location.reload.bind(location));
        window.addEventListener('load', onHashChange);
        const loader = document.createElement('div');
        const loaderBg = document.createElement('div');
        loaderBg.style.position = 'fixed';
        loaderBg.style.inset = '0';
        loaderBg.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        loaderBg.style.zIndex = '9998';
        loaderBg.style.backdropFilter = 'blur(5px)';
        loader.style.position = 'fixed';
        loader.style.top = '50%';
        loader.style.left = '50%';
        loader.style.transform = 'translate(-50%, -50%)';
        loader.style.fontSize = '24px';
        loader.textContent = 'Loading...';
        loader.style.color = '#eee';
        loader.style.zIndex = '9999';
        loader.style.padding = '20px';
        document.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(loader);
            document.body.appendChild(loaderBg);
        });
    </script>
    """.replace(
            "{menu}", menu
        )
        .replace("{menu_head}", menu_head)
        .replace("{game}", game)
        .replace("{game_head}", game_head)
        .replace("{compression_enabled}", "true" if compression_enabled else "false")
        .replace("{AUTO_UPDATE_URL}", "https://api.github.com/repos/magentapenguin/potato/releases/latest")
    )
    document = f"""<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{title}</title>
        {NAVIGATION_SCRIPT}
        <div id="head-content"></div>
    </head>
    <body style="background-color:black;color:white;">
        <noscript><p style="color:#e66;background-color:#300;padding:10px;margin-inline:10px;border-radius:10px;border:1px solid #e654;">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style="width:20px;height:20px;vertical-align:-5px;margin-inline-end:6px;">
  <path fill-rule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 1 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
</svg>Please enable JavaScript to view the content.</p></noscript>
        <div id="content"></div>
        <div style="position:fixed;bottom:10px;right:10px;font-size:12px;color:#666;">
            See the <a href="https://github.com/magentapenguin/potato" style="color:#48f">source code</a>
        </div>
    </body>
    </html>"""
    return document


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Build the game into a single HTML file"
    )
    parser.add_argument(
        "--output", "-o", default="dist/index.html", help="Output file path"
    )
    parser.add_argument(
        "--title", default="2.5d Maze Runner", help="Title of the generated HTML page"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose debug output"
    )
    parser.add_argument(
        "--src", "-s", default="src", help="Source directory containing HTML files"
    )
    parser.add_argument(
        "--inline-base", help="Base path to inline resources from (default: src or the value of --src)"
    )
    parser.add_argument(
        "--no-compress",
        action="store_true",
        help="Disable gzip compression for embedded content (results in larger file size but faster loading)",
    )
    args = parser.parse_args()
    if os.path.exists(args.output):
        logging.warning(
            f"Output file {args.output} already exists and will be overwritten."
        )
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if not args.inline_base:
        args.inline_base = args.src
    start = time.time()
    menu_content, menu_head = convert_html_to_page(os.path.join(args.src, "index.html"))
    game_content, game_head = convert_html_to_page(os.path.join(args.src, "game.html"))
    logging.info("Building menu content...")
    menu_content = inline_resources(replace_in_build(menu_content), args.inline_base)
    logging.info("Building menu head...")
    menu_head = inline_resources(replace_in_build(menu_head), args.inline_base)
    logging.info("Building game content...")
    game_content = inline_resources(replace_in_build(game_content), args.inline_base)
    logging.info("Building game head...")
    game_head = inline_resources(replace_in_build(game_head), args.inline_base)
    combined = combine_pages(
        args.title,
        menu_content,
        menu_head,
        game_content,
        game_head,
        compression_enabled=not args.no_compress,
    )
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    logging.info(f"Writing combined content to {args.output}")
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(combined)
    def format_time(seconds):
        if seconds < 60:
            return f"{seconds:.2f} seconds"
        elif seconds < 3600:
            return f"{seconds/60:.2f} minutes"
        else:
            return f"{seconds/3600:.2f} hours"
    print(f"\033[92mSuccessfully built {args.output} in \033[1m{format_time(time.time()-start)}\033[0m")


if __name__ == "__main__":
    main()
