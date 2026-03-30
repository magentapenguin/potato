# Compresses the game into a single html file for distribution
import os, bs4, re
import base64, gzip
import mimetypes

def convert_to_data_uri(file_path):
    mime_type, _ = mimetypes.guess_type(file_path)
    with open(file_path, 'rb') as f:
        data = f.read()
    encoded_data = base64.b64encode(data).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_data}"

def convert_to_data_uri_string(file_content: str, mime_type: str):
    encoded_data = base64.b64encode(file_content.encode('utf-8')).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_data}"

def replace_in_build(data: str):
    html_comment_pattern = re.compile(r"<!-- replace-in-build (.*?)->(.*?) -->") 
    generic_pattern = re.compile(r"\/\* replace-in-build (.*?)->(.*?) \*\/")
    remove_in_build_pattern = re.compile(r"\/\* remove-in-build \*\/")
    html_remove_in_build_pattern = re.compile(r"<!-- remove-in-build -->")
    while True:
        match = None
        for pattern in [generic_pattern, html_comment_pattern, remove_in_build_pattern, html_remove_in_build_pattern]:
            match = pattern.search(data)
            if match:
                break
        if not match:
            break
        line_start = data.rfind('\n', 0, match.start()) + 1
        line_end = data.find('\n', match.end())
        if line_end == -1:
            line_end = len(data)
        if "remove-in-build" in match.group(0):
            line = data[line_start:line_end]
            print(f"\033[2;31mRemoving in build: '{line}'\033[0m")
            data = data.replace(line, '')
            continue
        print(f"\033[2mReplacing in build: '{match.group(1)}' with '{match.group(2)}'\033[0m")
        line = data[line_start:line_end]
        data = data.replace(line, line.replace(match.group(0), '').replace(match.group(1), match.group(2)))
    return data
def inline_resources(data: str):
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
        line_start = data.rfind('\n', 0, match.start()) + 1
        line_end = data.find('\n', match.end())
        if line_end == -1:
            line_end = len(data)
        line = data[line_start:line_end]
        assert match.group(1) in line, f"Expected identifier '{match.group(1)}' not found in line: {line.strip()}"
        file_path = match.group(2)
        print(f"\033[2mProcessing inline content for file: {file_path}\033[0m")
        if os.path.exists(file_path):
            if file_path.endswith(('.js', '.css', '.ts', '.html', '.json')):
                with open(file_path, 'r', encoding='utf-8') as f:
                    file_content = f.read()
                file_content = replace_in_build(file_content)
                file_content = inline_resources(file_content)
                print(f"\033[32mInlined {file_path} with content length {len(file_content)}\033[0m")
                mime_type, _ = mimetypes.guess_type(file_path)
                data_uri = convert_to_data_uri_string(file_content, mime_type)
            else:
                print(f"\033[33mWarning: Inlining binary file {file_path} as data URI\033[0m")
                data_uri = convert_to_data_uri(file_path)
            data = data.replace(line, line.replace(match.group(0), '').replace(match.group(1), data_uri))
        else:
            print(f"\033[31mFile not found: {file_path}\033[0m")
            break
    return data


def convert_html_to_page(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    soup = bs4.BeautifulSoup(content, 'html.parser')
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
        elif isinstance(element, bs4.element.Tag) and element.name in ['meta', 'link', 'style']:
            important_head.append(str(element))
        elif isinstance(element, bs4.element.NavigableString):
            text = str(element).strip()
            if text:
                important_head.append(text)
    important_head = '\n'.join(important_head)
    body = soup.body
    return str(body), important_head

def combine_pages(title: str, menu: str, menu_head: str, game: str, game_head: str):
    print(f"\033[36;1mCompressing menu content...\033[0m")
    menu = base64.b64encode(gzip.compress(menu.encode('utf-8'))).decode('utf-8').replace('"','\\"').replace('\n', '\\n')
    print(f"\033[36;1mCompressing menu head...\033[0m")
    menu_head = base64.b64encode(gzip.compress(menu_head.encode('utf-8'))).decode('utf-8').replace('"','\\"').replace('\n', '\\n')
    print(f"\033[36;1mCompressing game content...\033[0m")
    game = base64.b64encode(gzip.compress(game.encode('utf-8'))).decode('utf-8').replace('"','\\"').replace('\n', '\\n')
    print(f"\033[36;1mCompressing game head...\033[0m")
    game_head = base64.b64encode(gzip.compress(game_head.encode('utf-8'))).decode('utf-8').replace('"','\\"').replace('\n', '\\n')
    NAVIGATION_SCRIPT = """
    <script>
        const documents = {
            '/index.html': ["{menu}", "{menu_head}"],
            '/game.html': ["{game}", "{game_head}"]
        };
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
        async function decompressAndDecode(data) {
            const compressedData = Uint8Array.fromBase64(data)
            const blob = new Blob([compressedData], { type: 'application/gzip' });
            const ds = new DecompressionStream("gzip");
            const decompressedStream = blob.stream().pipeThrough(ds);
            const decompressedBlob = await new Response(decompressedStream).blob();
            return await decompressedBlob.text();
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
            const loading = [decompressAndDecode(head).then(decompressedHead => {
                document.getElementById('head-content').innerHTML = decompressedHead;
                executeScripts(document.getElementById('head-content'));
            }),
            decompressAndDecode(content).then(decompressedContent => {
                document.getElementById('content').innerHTML = decompressedContent;
                executeScripts(document.getElementById('content'));
            })];
            Promise.all(loading).then(() => {
                console.log(`Loaded content for ${hash || '/index.html'}`);
                loader.style.display = 'none';
                loaderBg.style.display = 'none';
            }).catch((err) => {
                console.error('Error loading content:', err);
                alert('An error occurred while loading the page. Please try refreshing or check the console for details.');
            });
        }
        window.addEventListener('hashchange', onHashChange);
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
    """.replace('{menu}', menu).replace('{menu_head}', menu_head).replace('{game}', game).replace('{game_head}', game_head)
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
        <noscript>Please enable JavaScript to view the content.</noscript>
        <div id="content"></div>
    </body>
    </html>"""

    return document

def main():
    menu_content, menu_head = convert_html_to_page('src/index.html')
    game_content, game_head = convert_html_to_page('src/game.html')
    print(f"\033[96mBuilding menu content\033[0m")
    menu_content = inline_resources(replace_in_build(menu_content))
    print(f"\033[96mBuilding menu head\033[0m")
    menu_head = inline_resources(replace_in_build(menu_head))
    print(f"\033[96mBuilding game content\033[0m")
    game_content = inline_resources(replace_in_build(game_content))
    print(f"\033[96mBuilding game head\033[0m")
    game_head = inline_resources(replace_in_build(game_head))
    combined = combine_pages('2.5d Maze Runner', menu_content, menu_head, game_content, game_head)
    os.makedirs('dist', exist_ok=True)
    print(f"\033[34;1mWriting combined content to dist/maze_runner.html\033[0m")
    with open('dist/maze_runner.html', 'w', encoding='utf-8') as f:
        f.write(combined)

if __name__ == "__main__":
    main()