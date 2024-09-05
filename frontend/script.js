document.addEventListener('DOMContentLoaded', function () {
    const serverAddress = window.location.hostname + ':37372'
    const socket = window.location.protocol === 'http:'
	  ? new WebSocket('ws://' + serverAddress + '/ws')
	  : new WebSocket('wss://' + serverAddress + '/ws');

    let discordUserId = ""

    const colors = [
	"#40002b",
	"#990033",
	"#ff4500",
	"#ff9000",
	"#ffd635",
	"#fff8b8",
	"#aff257",
	"#00b368",
	"#008064",
	"#004852",
	"#007780",
	"#00ccc0",
	"#91fff8",
	"#358de6",
	"#2446a4",
	"#312680",
	"#493fb0",
	"#8e68d9",
	"#e4abff",
	"#b44ac0",
	"#721b8c",
	"#ba0d8b",
	"#ff5392",
	"#ffbfbf",
	"#ffffff",
	"#d4d7d9",
	"#898d90",
	"#515252",
	"#000000",
	"#5c3921",
	"#9c6926",
	"#ffb470"
    ]
    let currentColor;
    setupColors();

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const body = document.getElementById('body');
    const foot = document.getElementById('foot');
    const head = document.getElementById('head');
    const loadingContainer = document.getElementById('loading-container');
    const errorContainer = document.getElementById('error-container');
    const showColorsButton = document.getElementById('show-colors');
    const hideColorsButton = document.getElementById('hide-colors');

    let canvasScale = 1;
    let transform;
    const pixelSize = 8;
    const cellGridSize = 64;
    const cells = new Uint32Array(cellGridSize * cellGridSize);

    canvas.width = cellGridSize * pixelSize;
    canvas.height = canvas.width;
    // TODO: setup default position
    const headRect = head.getBoundingClientRect();
    canvas.style.top = `${headRect.bottom}px`;
    canvas.style.left = `${headRect.left}px`;

    function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const imageSize = Math.floor(cellGridSize * pixelSize);
	const imageData = ctx.createImageData(imageSize, imageSize);
	const pixels = new Uint8Array(imageData.data.buffer);
	for (let y = 0; y < imageSize; y++) {
	    for (let x = 0; x < imageSize; x++) {
		const index = (y * imageSize + x) * 4;
		const px = Math.floor(x / pixelSize);
		const py = Math.floor(y / pixelSize);
		const p = py * cellGridSize + px;
		const color = cells[p];
		const r = (color >> 16) & 0xFF, g = (color >> 8) & 0xFF, b = color & 0xFF;
		pixels[index] = r;
		pixels[index + 1] = g;
		pixels[index + 2] = b;
		pixels[index + 3] = 255;
	    }
	}
	ctx.putImageData(imageData, 0, 0);
    }

    draw();

    // BUG: when scrolling a lot, converges towards the center
    function applyScale(by, clientX, clientY) {
	const MIN = 0.5, MAX = 2.5;

	const prevScale = canvasScale;
	canvasScale += by;
	canvasScale = Math.min(Math.max(canvasScale, MIN), MAX);
	if (canvasScale <= MIN || canvasScale >= MAX) {
	    canvasScale = prevScale;
	    return;
	}
	const newScale = by > 0 ? 1+by : 1/(1-by);
	canvas.style.transform = `scale(${newScale})`;

	let rect = canvas.getBoundingClientRect();
	const pctX = (clientX - rect.left) / rect.width * 100;
	const pctY = (clientY - rect.top) / rect.height * 100;
	const transformOrigin = `${pctX}% ${pctY}%`
	canvas.style.transformOrigin = transformOrigin;

	// Absolute position instead of relative to previous frame
	rect = canvas.getBoundingClientRect()
	canvas.style.left = `${rect.left}px`;
	canvas.style.top = `${rect.top}px`;
	canvas.style.width = `${rect.width}px`;
	canvas.style.height = `${rect.height}px`;
	canvas.style.transformOrigin = "";
	canvas.style.transform = "";
    }

    body.addEventListener('wheel', (event) => {
	const scaleInc = event.deltaY > 0 ? -0.1 : 0.1;
	applyScale(scaleInc, event.clientX, event.clientY);
    });

    var hammertime = new Hammer(body, { passive: true });
    hammertime.get('tap').set({ enable: true, time: 1000*60 });
    hammertime.on('tap', (ev) => {
	release(ev.center.x, ev.center.y);
    });
    let originX, originY;
    hammertime.get('pan').set({ threshold: 0 });
    hammertime.on('panstart', (ev) => {
	const rect = canvas.getBoundingClientRect();
	originX = rect.left;
	originY = rect.top;
    });
    hammertime.on('panmove', (ev) => {
	canvas.style.left = originX + ev.deltaX + 'px';
        canvas.style.top = originY + ev.deltaY + 'px';
    });

    hammertime.get('pinch').set({ enable: true });
    let prevScale;
    hammertime.on('pinchstart', (ev) => {
	prevScale = 1;
    });
    hammertime.on('pinchmove', (ev) => {
	let newScale = ev.scale - prevScale;
	applyScale(newScale, ev.center.x, ev.center.y);
	prevScale = ev.scale;
    });

    function release(clientX, clientY) {
	const rect = canvas.getBoundingClientRect();
	let mouseX = clientX - rect.left;
	let mouseY = clientY - rect.top;
	if (mouseX > rect.width || mouseX < 0) {
	    return;
	}
	if (mouseY > rect.height || mouseY < 0) {
	    return;
	}
	mouseX = Math.floor(mouseX / rect.width * cellGridSize);
	mouseY = Math.floor(mouseY / rect.height * cellGridSize);
	console.log(mouseX, mouseY);
	socket.send(JSON.stringify({
	    x: mouseY + '',
	    y: mouseX + '',
	    color: currentColor,
	    userId: discordUserId
	}));
    }

    function toggleColors() {
	showColorsButton.classList.toggle('is-hidden');
	document.getElementById('colors-container').classList.toggle('is-hidden');
    }

    showColorsButton.addEventListener('click', toggleColors);
    hideColorsButton.addEventListener('click', toggleColors);

    const navbarBurgers = Array.prototype.slice.call(document.querySelectorAll('.navbar-burger'), 0);
    navbarBurgers.forEach((el) => {
	el.addEventListener('click', () => {
	    const target = document.getElementById(el.dataset.target);
	    el.classList.toggle('is-active');
	    target.classList.toggle('is-active');
	});
    });

    function setupColors() {
	const setCurrentColor = (button, color) => {
            currentColor = color;
	    document.querySelectorAll('#color-button').forEach(colorButton => {
		colorButton.innerText = '';
		colorButton.classList.add('is-rounded');
	    });
	    button.classList.remove('is-rounded');
	    button.innerText = '  ';
	}
	for (const color of colors) {
            const colorButton = document.createElement('button');

            colorButton.className = 'button is-white';
	    colorButton.id = 'color-button';
            colorButton.style.backgroundColor = color;
            colorButton.addEventListener('click', () => setCurrentColor(colorButton, color));
            document.getElementById('color-palette').appendChild(colorButton);
	}
	setCurrentColor(document.querySelectorAll('#color-button')[0], colors[0]);
    }

    socket.addEventListener('open', (event) => {
	col = encodeURIComponent('columns') + '=' + encodeURIComponent(cellGridSize);
	row = encodeURIComponent('rows') + '=' + encodeURIComponent(cellGridSize);
	fetch(window.location.protocol + "//" + serverAddress + '?' + col + '&' + row, {
	    method: 'GET',
	    headers: {
		'Content-Type': 'application/json',
	    },
	})
	    .then(response => { return response.json(); })
	    .then(data => {
		if (data.retryAfter) {
		    tooManyRequests(data.retryAfter);
		    throw new Error(data.message);		    
		} else if (data.pixels) {
		    initPage(data);
		} else {
		    throw new Error('Network response was not ok');
		}
	    })
	    .catch(error => console.log(error));
    });

    socket.addEventListener('message', (event) => {
	const data = JSON.parse(event.data);

	if ('error' in data) {
	    console.log('Error: ', data.error, ': ', data);
	    return;
	}
	if ('waitSeconds' in data) {
	    startCountdown(data.waitSeconds);
	    return;
	}
	cells[+data.x * cellGridSize + +data.y] = parseInt(data.color.slice(1), 16);
	draw();
    });

    function initPage(json) {
	let pixels = json.pixels;
	startCountdown(Math.floor(json.timeLeft));
	pixels.forEach((array, x) => {
	    array.forEach((color, y) => {
		cells[x * cellGridSize + y] = parseInt(color.slice(1), 16);
	    });
	});
	draw();

	loadingContainer.classList.add('is-hidden');
	canvas.classList.remove('is-hidden');
    }

    function tooManyRequests(waitTime) {
	loadingContainer.classList.add('is-hidden');
	errorContainer.classList.remove('is-hidden');
	const content = errorContainer.firstElementChild;
	const h1 = document.getElementById('error-header');
	const p = document.getElementById('error-body');
	h1.textContent = 'Oops! Too many refresh.';
	p.textContent = 'Please wait a few seconds for the page to refresh automatically.';
	setTimeout(() => { window.location.reload() }, waitTime);
    }

    function startCountdown(fromSeconds) {
	const timer = document.getElementById('timer');
	const timerContainer = document.getElementById('timer-container');
	timerContainer.classList.remove('is-invisible');
	function interval () {
	    timer.textContent = Math.floor(fromSeconds / 60);
	    timer.textContent += ':';
	    timer.textContent += fromSeconds % 60;
	    fromSeconds--;
	}
	interval();
	const intervalId = setInterval(interval, 1000);
	setTimeout(() => {
	    timerContainer.classList.add('is-invisible');
	    clearInterval(intervalId);
	}, (fromSeconds + 1) * 1000);
    }

    document.getElementById('sign-out').addEventListener('click', clearDiscordCache);

    function clearDiscordCache() {
	localStorage.removeItem('access_token');
	localStorage.removeItem('token_type');
	window.history.replaceState({}, document.title, window.location.pathname);
	document.getElementById('account').classList.add('is-hidden');	
	document.getElementById('login').classList.remove('is-hidden');
	discordUserId = "";
    }

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    let [accessToken, tokenType] = [
	fragment.get('access_token'),
	fragment.get('token_type'),
    ];
    if (accessToken) {
	localStorage.setItem('access_token', accessToken);
	localStorage.setItem('token_type', tokenType);
    } else {
	[accessToken, tokenType] = [
	    localStorage.getItem('access_token'),
	    localStorage.getItem('token_type'),
	];
    }

    if (!accessToken) {
	document.getElementById('login').classList.remove('is-hidden');
    } else {
	fetch('https://discord.com/api/users/@me', {
	    headers: {
		authorization: `${tokenType} JFKT9YELxHcOoHAp8jXJ2n4P5WEDF4`,
	    },
	})
	    .then(result => result.json())
	    .then(user => {
		console.log(user);		
		if (!user) {
		    throw new Error('No response received, malformed GET request.');
		}
		if (user.message) {
		    console.log(`Token ${accessToken} expired or invalid. Clearing login token.`);
		    clearDiscordCache();
		}
		discordUserId = user.id;
		document.getElementById('username').href = 'https://discordapp.com/users/' + user.id;
		document.getElementById('username').innerText = user.discriminator === "0"
		    ? user.global_name
		    : user.username + '#' + user.discriminator;
		document.getElementById('account').classList.remove('is-hidden');
	    })
	    .catch(error => {
		console.error(error);
	    });
    }

    const checkbox = document.getElementById('dark-mode-switch');
    checkbox.checked = true;

    if (localStorage.getItem('dark-mode')) {
	if (localStorage.getItem('dark-mode') === "false") {
	    toggleLightnessMode();
	      checkbox.checked = false;
	}
    } else {
	if (window.matchMedia
	    && window.matchMedia('(prefers-color-scheme: light)').matches) {
	    toggleLightnessMode();
	    checkbox.checked = false;
	}
    }

    document.getElementById('dark-mode-switch').addEventListener('change', () => {
	const toggle = localStorage.getItem('dark-mode') === "true" ? "false" : "true";
	localStorage.setItem('dark-mode', toggle);
	toggleLightnessMode();
    });
});

function toggleLightnessMode() {
    document.getElementById('canvas').classList.toggle('canvas-dark');
    document.getElementById('hero').classList.toggle('is-dark');
    document.getElementById('head').classList.toggle('has-background-black');
    document.getElementById('head').classList.toggle('has-background-white');
    document.getElementById('navbar').classList.toggle('is-dark');
    document.getElementById('navbar-dropdown').classList.toggle('has-background-black');
    document.getElementById('nav-menu').classList.toggle('has-background-black');
    document.getElementById('body').classList.toggle('has-background-black-bis');
    document.getElementById('foot').classList.toggle('has-background-white');
    document.getElementById('foot').classList.toggle('has-background-black');
    document.getElementById('error-header').classList.toggle('has-text-white');
    document.getElementById('error-body').classList.toggle('has-text-white');
    document.getElementById('error-header').classList.toggle('has-text-dark');
    document.getElementById('error-body').classList.toggle('has-text-dark');
}
