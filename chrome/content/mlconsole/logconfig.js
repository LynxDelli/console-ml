var editMode = false;

function execLocalConfig(){
	if (editMode){
		editLocalConfig();
	} else {
		addLocalConfig();
	}
}

function execRemoteConfig(){
	if (editMode){
		editRemoteConfig();
	} else {
		addRemoteConfig();
	}
}

function addLocalConfig(){
	window.arguments[0].local = true;
	window.arguments[0].name = window.document.getElementById("textlocalName").value;
	window.arguments[0].path = window.document.getElementById("textlocalPath").value;
	var error = window.arguments[1].addNewLogConfig();
	if (error.length > 0){
		alert(error);
	} else {
		window.close();
	}
};

function addRemoteConfig(){
	window.arguments[0].local = false;
	window.arguments[0].name = window.document.getElementById("textremoteName").value;
	window.arguments[0].path = window.document.getElementById("textRemoteURL").value;
	window.arguments[0].user = window.document.getElementById("textRemoteAdmin").value;
	window.arguments[0].pass = window.document.getElementById("textRemotePass").value;
	var error = window.arguments[1].addNewLogConfig();
	if (error.length > 0){
		alert(error);
	} else {
		window.close();
	}
}

function checkLogConfig(){
	//window.arguments[0].local = false;
	
	if (window.arguments[0].name.length > 0){
		editMode = true;
		window.document.getElementById("textlocalName").setAttribute("collapsed", "true");
		window.document.getElementById("textremoteName").setAttribute("collapsed", "true");
		window.document.getElementById("lblLocalName").setAttribute("collapsed", "false");
		window.document.getElementById("lblRemoteName").setAttribute("collapsed", "false");
		if (!window.arguments[0].local){
			window.document.getElementById("myTabList").selectedIndex = 1;
			window.document.getElementById("lblRemoteName").setAttribute("value", window.arguments[0].name);
			window.document.getElementById("tabLocalLog").setAttribute("collapsed", "true");
			window.document.getElementById("textRemoteURL").setAttribute("value", window.arguments[0].path);
			window.document.getElementById("textRemoteAdmin").setAttribute("value", window.arguments[0].user);
			window.document.getElementById("textRemotePass").setAttribute("value", window.arguments[0].pass);
		} else {
			window.document.getElementById("textlocalPath").setAttribute("value", window.arguments[0].path);
			window.document.getElementById("lblLocalName").setAttribute("value", window.arguments[0].name);
			window.document.getElementById("tabRemoteLog").setAttribute("collapsed", "true");
		}
	}
}

function editLocalConfig(){
	window.arguments[0].path = window.document.getElementById("textlocalPath").value;
	var error = window.arguments[1].saveLogConfig();
	if (error.length > 0){
		alert(error);
	} else {
		window.close();
	}
};

function editRemoteConfig(){
	window.arguments[0].path = window.document.getElementById("textRemoteURL").value;
	window.arguments[0].user = window.document.getElementById("textRemoteAdmin").value;
	window.arguments[0].pass = window.document.getElementById("textRemotePass").value;
	var error = window.arguments[1].saveLogConfig();
	if (error.length > 0){
		alert(error);
	} else {
		window.close();
	}
}