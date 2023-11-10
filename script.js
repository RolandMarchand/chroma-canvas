document.addEventListener('DOMContentLoaded', function () {
    const gridContainer = document.getElementById('grid-container');
    const colorPalette = document.getElementById('color-palette');
    const colorPointer = document.getElementById('color-pointer');
    const waitTimeHeader = document.getElementById('wait-time');
    const gridSize = 32;

    const serverAddress = 'lazarusoverlook.com:37372';

    let currentColor;
    const colors = [
	'#222222',
	'#888888',
	'#E4E4E4',
	'#FFFFFF',
	'#A06A42',
	'#E50000',
	'#E59500',
	'#E5D900',
	'#94E044',
	'#02BE01',
	'#00D3DD',
	'#0083C7',
	'#0000EA',
	'#820080',
	'#CF6EE4',
	'#FFA7D1',
    ]

    for (let x = 0; x < gridSize; x++) {
	for (let y = 0; y < gridSize; y++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
	    cell.id = x + ',' + y;
            cell.addEventListener('click', (event) => {
		socket.send(JSON.stringify({
		    x: x + '',
		    y: y + '',
		    color: currentColor,
		}));
	    });
            gridContainer.appendChild(cell);
	}
    }

    for (const color of colors) {
	const pointerBox = document.createElement('div');
	pointerBox.className = 'pointer-box';

	// Pointer underneath color box
	const pointerParagraph = document.createElement('p');
	pointerParagraph.className = 'pointer-paragraph';
	pointerParagraph.textContent = '↑';

	pointerBox.appendChild(pointerParagraph);
	colorPointer.appendChild(pointerBox);
        const colorBox = document.createElement('div');

        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = color;
        colorBox.addEventListener('click', () => setCurrentColor(color, pointerParagraph));
        colorPalette.appendChild(colorBox);
    }

    function onCellClick(x, y, cell) {
        cell.style.backgroundColor = currentColor;
	postColor(x, y, currentColor);
    }

    function setCurrentColor(color, ptr) {
        currentColor = color;

	var pointersList = document.querySelectorAll('.pointer-paragraph');
	var pointersArray = Array.from(pointersList);
	pointersArray.forEach(function(p) {
	    p.style.visibility = 'hidden';
	});
	ptr.style.visibility = 'visible';
    }
    setCurrentColor(colors[0], colorPointer.childNodes[0].childNodes[0]);

    const socket = new WebSocket('ws://' + serverAddress + '/ws');

    socket.addEventListener('open', (event) => {
	fetch('https://' + serverAddress, {
	    method: 'GET',
	    headers: {
		'Content-Type': 'application/json',
	    },
	})
	    .then(response => {
		console.log(response);
		return response.json();
	    })
	    .then(data => apply(data))
	    .catch(error => console.error('Error:', error));
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
	let cells = document.getElementsByClassName('grid-cell');
	cells[+data.x * gridSize + +data.y].style.backgroundColor = data.color;
    });

    function apply(json) {
	let cells = document.getElementsByClassName('grid-cell');
	let pixels = json.pixels;
	startCountdown(Math.floor(json.timeLeft));
	pixels.forEach((array, x) => {
	    array.forEach((color, y) => {
		cells[y * gridSize + x].style.backgroundColor = color;
	    });
	});
    }

    function startCountdown(fromSeconds) {
	waitTimeHeader.style.visibility = 'visible';
	function interval () {
	    waitTimeHeader.textContent = Math.floor(fromSeconds / 60);
	    waitTimeHeader.textContent += ':';
	    waitTimeHeader.textContent += fromSeconds % 60;
	    fromSeconds--;
	}
	interval();
	const intervalId = setInterval(interval, 1000);
	setTimeout(() => {
	    waitTimeHeader.style.visibility = 'hidden';
	    clearInterval(intervalId);
	}, (fromSeconds + 1) * 1000);
    }
});
