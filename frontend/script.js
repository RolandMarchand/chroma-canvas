document.addEventListener('DOMContentLoaded', function () {
    // Conditionally set server address and protocol based on the environment
    const secretDiscordAPIKey = 'rl8jKRS1i8AgxTZRDpsSjhaVQKKYt-4_';
    const isLocal = window.location.protocol === 'file:'
	  || window.location.hostname === 'localhost'
	  || window.location.hostname === '127.0.0.1';
    const serverAddress = isLocal
	  ? 'localhost:37372'
	  : 'lazarusoverlook.com:37372';
    const socket = window.location.protocol === 'http:'
	  ? new WebSocket('ws://' + serverAddress + '/ws')
	  : new WebSocket('wss://' + serverAddress + '/ws');

    let discordUserId = ""

    const colors = [
	'#d9d3d9',
	'#b8b0b9',
	'#a097a1',
	'#6b5e6b',
	'#483d48',
	'#2a202a',
	'#a7776b',
	'#865d56',
	'#694744',
	'#3e2730',
	'#8a2e3f',
	'#a83f48',
	'#c65550',
	'#d37755',
	'#dc995d',
	'#dec575',
	'#a8b164',
	'#6f975e',
	'#3b6b58',
	'#2d494b',
	'#466f77',
	'#6c9ba7',
	'#9db8c5',
	'#7e8aa7',
	'#524f73',
	'#473354',
	'#613661',
	'#7c3a67',
	'#ba617c',
	'#d3a092',
	'#5f80a6',
	'#566794',
	'#74628f',
	'#6c437a',
	'#54373a',
	'#612b38',
	'#36373d',
	'#432d42',
    ]
    let currentColor;
    setupColors();

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const body = document.getElementById('body');
    const foot = document.getElementById('foot');
    const head = document.getElementById('head');
    const loadingContainer = document.getElementById('loading-container');
    const canvasContainer = document.getElementById('canvas-container');
    const errorContainer = document.getElementById('error-container');
    const showColorsButton = document.getElementById('show-colors');
    const hideColorsButton = document.getElementById('hide-colors');

    canvas.width = body.clientWidth;
    canvas.height = window.innerHeight - head.offsetHeight - foot.offsetHeight;

    let offsetX = 0;
    let offsetY = 0;
    let canvasScale = 1;
    const pixelSize = 8;
    const cellGridSize = 64;
    const cells = new Uint32Array(cellGridSize * cellGridSize);

    window.addEventListener('resize', resize);

    function resize() {
	canvas.width = body.clientWidth;
	canvas.height = window.innerHeight - head.offsetHeight - foot.offsetHeight;
	draw();
    }

    function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const imageSize = Math.floor(cellGridSize * pixelSize * canvasScale);
	const imageData = ctx.createImageData(imageSize, imageSize);
	const pixels = new Uint8Array(imageData.data.buffer);
	for (let y = 0; y < imageSize; y++) {
	    for (let x = 0; x < imageSize; x++) {
		const index = (y * imageSize + x) * 4;
		const px = Math.floor(x/(pixelSize*canvasScale));
		const py = Math.floor(y/(pixelSize*canvasScale));
		const p = py * cellGridSize + px;
		const color = cells[p];
		const r = (color >> 16) & 0xFF, g = (color >> 8) & 0xFF, b = color & 0xFF;
		pixels[index] = r;
		pixels[index + 1] = g;
		pixels[index + 2] = b;
		pixels[index + 3] = 255;
	    }
	}
	ctx.putImageData(imageData, offsetX, offsetY);
    }

    draw();

    canvas.addEventListener('wheel', (event) => {
	const rect = canvas.getBoundingClientRect();
	const mouseX = event.clientX - rect.left - offsetX;
	const mouseY = event.clientY - rect.top - offsetY;
	const newScale = event.deltaY > 0 ? 0.9 : 1.1;
	applyScale(newScale, mouseX, mouseY);
    });

    function applyScale(by, pivotX, pivotY) {
	const gridSizeBefore = (pixelSize * cellGridSize * canvasScale);
	const xRatioBefore = pivotX / gridSizeBefore;
	const yRatioBefore = pivotY / gridSizeBefore;

	canvasScale *= by;
	canvasScale = Math.max(0.5, Math.min(canvasScale, 3));

	const gridSizeAfter = (pixelSize * cellGridSize * canvasScale);
	const xRatioAfter = pivotX / gridSizeAfter;
	const yRatioAfter = pivotY / gridSizeAfter;

	offsetX += (xRatioAfter - xRatioBefore) * gridSizeAfter;
	offsetY += (yRatioAfter - yRatioBefore) * gridSizeAfter;

	draw();
    }

    let isInteracting;
    let dragged;
    let lastX, lastY;

    canvas.addEventListener('mousedown', (event) => {
	isInteracting = true;
	lastX = event.clientX;
	lastY = event.clientY;
    });
    canvas.addEventListener('mousemove', (event) => {
	if (isInteracting) {
	    dragged = true;
	    move(event);
	}
    });
    canvas.addEventListener('mouseup', (event) => {
	if (!dragged) {
	    release(event);
	}
	isInteracting = false;
	dragged = false;
    });

    let oneTouchInput = true;

    canvas.addEventListener('touchstart', (event) => {
	lastX = event.touches[0].clientX;
	lastY = event.touches[0].clientY;
    });

    canvas.addEventListener('touchmove', (event) => {
	event.preventDefault();
	dragged = true;

	if (event.touches.length === 1) {
	    move(event.touches[0]);
	    return;
	}
	oneTouchInput = false;
	if (event.touches.length > 2) {
	    return;
	}
	const touch1 = events.touches[0];
	const touch2 = events.touches[1];
	const rect = canvas.getBoundingClientRect();
	const pivotX = (touch1.clientX + touche2.clientX) / 2 - rect.left - offsetX;
	const pivotY = (touch1.clientY + touche2.clientY) / 2 - rect.top - offsetY;
	const scaleMagnitude = Math.sqrt((touch1.clientX - touche2.clientX) ** 2 +
					 (touch1.clientY - touche2.clientY) ** 2);
	applyScale(scaleMagnitude, pivotX, pivotY);
    });

    canvas.addEventListener('touchend', (event) => {
        event.preventDefault();
	if (event.changedTouches.length === 1) {
	    if (oneTouchInput && !dragged) {
		release(event.changedTouches[0]);
	    }
	}
	if (event.touches.length === 0) {
	    dragged = false;
	}
	oneTouchInput = true;
    });

    function toggleColors() {
	showColorsButton.classList.toggle('is-hidden');
	document.getElementById('colors-container').classList.toggle('is-hidden');
	resize();
    }

    showColorsButton.addEventListener('click', toggleColors);
    hideColorsButton.addEventListener('click', toggleColors);
    
    function move(event) {
	const deltaX = event.clientX - lastX;
	const deltaY = event.clientY - lastY;

	offsetX += deltaX;
	offsetY += deltaY;

	lastX = event.clientX;
	lastY = event.clientY;

	draw();
    }

    function release(event) {
	const rect = canvas.getBoundingClientRect();
	const gridSize = (pixelSize * cellGridSize * canvasScale);
	let mouseX = event.clientX - rect.left - offsetX;
	let mouseY = event.clientY - rect.top - offsetY;
	if (mouseX > gridSize || mouseX < 0) {
	    return;
	}
	if (mouseY > gridSize || mouseX < 0) {
	    return;
	}
	mouseX = Math.floor(mouseX / (pixelSize * canvasScale));
	mouseY = Math.floor(mouseY / (pixelSize * canvasScale));
	socket.send(JSON.stringify({
	    x: mouseY + '',
	    y: mouseX + '',
	    color: currentColor,
	    userId: discordUserId
	}));
    }

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
	canvasContainer.classList.remove('is-hidden');
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

    console.log(localStorage.getItem('dark-mode'));
    if (localStorage.getItem('dark-mode') === "false") {
	toggleLightnessMode();
    }
    document.getElementById('dark-mode-switch').addEventListener('change', () => {
	const toggle = localStorage.getItem('dark-mode') === "true" ? "false" : "true";
	localStorage.setItem('dark-mode', toggle);
	toggleLightnessMode();
    });
});

function toggleLightnessMode() {
    document.getElementById('hero').classList.toggle('is-dark');
    document.getElementById('head').classList.toggle('has-background-black');
    document.getElementById('navbar').classList.toggle('is-dark');
    document.getElementById('navbar-dropdown').classList.toggle('has-background-black');
    document.getElementById('nav-menu').classList.toggle('has-background-black');
    document.getElementById('canvas-container').classList.toggle('has-background-black-bis');
    document.getElementById('foot').classList.toggle('has-background-black');
    document.getElementById('error-header').classList.toggle('has-text-white');
    document.getElementById('error-body').classList.toggle('has-text-white');
    document.getElementById('error-header').classList.toggle('has-text-dark');
    document.getElementById('error-body').classList.toggle('has-text-dark');
}
