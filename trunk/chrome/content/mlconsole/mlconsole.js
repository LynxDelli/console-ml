/* 
 * Author: Milen Vitanov
 */
 
FBL.ns(function() { with (FBL) {

var FIREBUG_OVERLAY_LOCATION = "chrome://firebug/content/firefox/firebug.xul";
var NO_RESULTS_MSG = "No results returned.";
var NO_RESULTS_AJAX_MSG = "AJAX call: No results returned.";
var ML_SERVER_HEADER = "MarkLogic";

var LEVEL_CUSTOM = "level-custom";
var LEVEL_TOGGLE = "level-toggle";

var LOCAL_LOG_TYPE = "local";
var REMOTE_LOG_TYPE = "remote";

var LOG_INFO = "Info:";
var LOG_WARNING = "Warning:";
var LOG_NOTICE = "Notice:";
var LOG_FINEST = "Finest:";
var LOG_FINER = "Finer:";
var LOG_FINE = "Fine:";
var LOG_DEBUG = "Debug:";
var LOG_CONFIG = "Config:";
var LOG_ERROR = "Error:";
var LOG_CRITICAL = "Critical:";
var LOG_ALERT = "Alert:";
var LOG_EMERGENCY = "Emergency:";
var LOG_MESSAGE = "Message:";

var MEGABYTE_LENGTH = 1024 * 1024;

var panelName = "MLConsole";
var isPanelOpened = false;
var waitingForPage = "";
var waitingNextRequest = false;
var requestsMade = 0;
var responseTimeout = null;
var nextRequestTimeout = null;
var mlWebProgressListener = null;
var currentLogType = "";
var prefBranch = null;
var xhrRequests = { count: 0 };
var respXHRListener;
var reqXHRListener;
var updateRequestsWaiting = 0;
var currentConsoleMsgLevel = "";
var clipboard = null;
var logConfigDialog;
var logConfigObject;
var currentDocument = window.document;
var userCredentials = null;

var wwatch = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
                .getService(Components.interfaces.nsIWindowWatcher);

var passwordManager = Components.classes["@mozilla.org/login-manager;1"]
                        .getService(Components.interfaces.nsILoginManager);  
						
var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",  
                    Components.interfaces.nsILoginInfo, "init");
			  
/*variables that define the label with pending log messages in the toolbar*/
var isMLServer = false;
var pendingLogMessages = 0;
var tabLabelStates = {};
var currentTab = null;

var logConfigurations = {
	"default local log": {
		isLocal: true,
		path: "C:\\Program Files\\MarkLogic\\Data\\Logs\\ErrorLog.txt"
	},
	"default remote log": {
		isLocal: false,
		path: "http://localhost:8001/get-error-log.xqy?filename=ErrorLog.txt",
		user: "admin",
		pass: "admin"
	}
};
var selectedLogConfig = "";
var skipLogPath = {};

var otherTabSelected = function(event) {
	//reinitialize the variables that fire the log update events on each tab change.
	//this must be done because the ProgressListeners are global but these variables must be local only for the current 
	waitingForPage = "";
	xhrRequests = { count: 0 };
	var tabkey;
	if (currentTab != null){
		tabkey = escape(currentTab.currentURI.spec);
		tabLabelStates[tabkey] = {
			isMLServer_: isMLServer,
			pendingLogMessages_: pendingLogMessages
		};
	}
	//get new tab and try to reload data from tab labels stored objects
	currentTab = gBrowser.getBrowserForTab(gBrowser.selectedTab);
	tabkey = escape(currentTab.currentURI.spec);
	if (tabLabelStates[tabkey]){
		isMLServer = tabLabelStates[tabkey].isMLServer_;
		pendingLogMessages = tabLabelStates[tabkey].pendingLogMessages_;
		//if new tab is selected while firebug is opened, clear the label log notifications
		if (isPanelOpened && !Firebug.isDetached()){
			pendingLogMessages = 0;
		}
	} else {
		isMLServer = false;
		pendingLogMessages = 0;
	}
	
	Firebug.MLConsoleModel.updateButtonMsgLabel();
};

var mlConsoleTemplate = domplate(
{
	log:
    DIV({class: "noticeui " + "$wrapperClass"},
			H1("$lvl"),
			DIV({class: "log-part-wrapper"},
				FOR ( "aRow", "$logRows",
					P("$aRow"),
					HR({class: "noticeui-hr"})
				)
			),
			SPAN({onclick: "$toggleMessage"})
    ),
		
  info:			TAG("$log", {wrapperClass:"noticeui-info", lvl:"Info", logRows:"$rows"}),			
  warning:	TAG("$log", {wrapperClass:"noticeui-warning", lvl:"Warning", logRows:"$rows"}),
  notice:		TAG("$log", {wrapperClass:"noticeui-notice", lvl:"Notice", logRows:"$rows"}),
  message:	TAG("$log", {wrapperClass:"noticeui-message", lvl:"ConsoleML message", logRows:"$rows"}),
  finest:		TAG("$log", {wrapperClass:"noticeui-finest", lvl:"Finest", logRows:"$rows"}),
  finer:		TAG("$log", {wrapperClass:"noticeui-finer", lvl:"Finer", logRows:"$rows"}),
  fine:			TAG("$log", {wrapperClass:"noticeui-fine", lvl:"Fine", logRows:"$rows"}),
  debug:		TAG("$log", {wrapperClass:"noticeui-debug", lvl:"Debug", logRows:"$rows"}),
  config:		TAG("$log", {wrapperClass:"noticeui-config", lvl:"Config", logRows:"$rows"}),
  error:		TAG("$log", {wrapperClass:"noticeui-error", lvl:"Error", logRows:"$rows"}),
  critical:	TAG("$log", {wrapperClass:"noticeui-critical", lvl:"Critical", logRows:"$rows"}),
  alert:		TAG("$log", {wrapperClass:"noticeui-alert", lvl:"Alert", logRows:"$rows"}),
  emergency:TAG("$log", {wrapperClass:"noticeui-emergency", lvl:"Emergency", logRows:"$rows"}),		
		
  toggleMessage: function(event)
  {
		var srcTarget = jQuery(event.target);
		var childElements = srcTarget.parent().find('.log-part-wrapper');
		if(srcTarget.hasClass('collapsedLog')) {
			childElements.show();
			srcTarget.removeClass('collapsedLog');
		} else {
			childElements.hide();
			srcTarget.addClass('collapsedLog');
		}
  }
});

var mlmodel={
		
    initialize: function(owner)
    {
		
        Firebug.Module.initialize.apply(this, arguments);
		//initialize checked state for the custom log type ckecked messages
		var checkedCustomTypes = this.getPrefBranch().getCharPref("customfiltertypes");
		if(checkedCustomTypes.length > 0){
			var checkedIds = checkedCustomTypes.split("#");
			for(var i=0; i<checkedIds.length; i++){
				if(checkedIds[i].length > 0){
					currentDocument.getElementById(checkedIds[i]).setAttribute("checked", "true");
					//filter types and toggle buttons are in the same menu, controlled by the same checks
					this.addToggleButton(checkedIds[i].substring("checknoticeui-".length));
				}
			}
		}
		
		//Initialize previous filter group here
		var checkedToggleButton = this.getPrefBranch().getCharPref("togglestatus");
		try{
		if (checkedToggleButton.length > 1){
			var checkedButtonsArray = checkedToggleButton.split("#");
			currentConsoleMsgLevel = checkedButtonsArray[0];
			currentDocument.getElementById(checkedButtonsArray[1]).setAttribute("checked", "true");
		} else {
			currentConsoleMsgLevel = LEVEL_CUSTOM;
			currentDocument.getElementById("toggleCustom").setAttribute("checked", "true");
			//window.document.getElementById("toggleAll").setAttribute("checked", "true");
			this.selectAllMenu("customLogLevelsMenuContainer");
		}
		}catch (e){
			alert(e);
		}
		//initialize log configurations
		var logConfigStr = this.getPrefBranch().getCharPref("logConfigurations");
		if (logConfigStr.length > 0){
			logConfigurations = eval(logConfigStr);
		}
		selectedLogConfig = this.getPrefBranch().getCharPref("selectedLogConfig");
		for (key in logConfigurations){
			this.addLogConfiguration(logConfigurations[key], key);
			skipLogPath[key] = 0;
		}
		
		//load jQuery
		var jsLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
		jsLoader.loadSubScript("chrome://mlconsole/content/jquery.js");
		jQuery.noConflict();
		//initialize web progress listnerers, tabbed browser listener and XHR requests listener
		this.initModelListeners();
		this.initPasswords();
    },
	
	initPasswords: function()
	{
		var passMigradted = this.getPrefBranch().getBoolPref("passwordsmigrated");
		if (!passMigradted){//try to migrate all the passwords and store them using nsiPasswordManager - this will be done only once
			this.getPrefBranch().setBoolPref("passwordsmigrated", true);
			for (key in logConfigurations){
				if (!logConfigurations[key].isLocal){
					
					//remote log, store password into password manager
					this.storePassword(logConfigurations[key].path, logConfigurations[key].user, logConfigurations[key].pass);
					logConfigurations[key].user = "";
					logConfigurations[key].pass = "";
				}
			}
		}
		if (!logConfigurations[selectedLogConfig].isLocal){
			//load user preferences on initialization, if the selected log config is remote
			userCredentials = this.retrievePassword(logConfigurations[selectedLogConfig].path);
		}
	},
	
	storePassword: function(path, username, password){
		try{
			var loginInfo = new nsLoginInfo(this.stripHostData(path), path, null,
				username, password, "", "");
			passwordManager.addLogin(loginInfo);
		} catch (e)
		{
			//thrown when the login already exists - in this case we are OK, because authentication will pass as expected
		}
	},
	
	deletePassword: function(path, usernm){
		try {		   
		   // Find users for this extension   
		   var logins = passwordManager.findLogins({}, this.stripHostData(path), path, null);  
				
		   for (var i = 0; i < logins.length; i++) {  
			  if (logins[i].username == usernm) {  
				 passwordManager.removeLogin(logins[i]);  
				 break;  
			  }  
		   }  
		}  
		catch(ex) {  
		   // This will only happen if there is no nsILoginManager component class  
		}
	},
	
	stripHostData: function(path){
		var prefix = "";
		if (path.indexOf("://") != -1){
			var splitPath = path.split("://");
			prefix = splitPath[0] + "://";
			path = splitPath[1];
		}
		if (path.indexOf("/") != -1){
			path = path.substring(0, path.indexOf("/"));
		}
		path = prefix + path;
		return(path);
	},
	
    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        //try to add the toolbar button for this plugin on startup
		setTimeout("Firebug.MLConsoleModel.appendToToolbar()", 1000);
    },
	
	shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
		//Firebug.NetMonitor.removeListener(this.netListener);
		if (mlWebProgressListener){
			window.getBrowser().removeProgressListener(mlWebProgressListener);
			
			var observerService = Cc["@mozilla.org/observer-service;1"]
				.getService(Ci.nsIObserverService);

			observerService.removeObserver(respXHRListener,
				"http-on-examine-response");
				
			observerService.removeObserver(reqXHRListener,
				"http-on-modify-request");
			
			var container = gBrowser.tabContainer;			
			container.removeEventListener("TabSelect", otherTabSelected, false);  
		}
		//save checked state for the custom log type ckecked messages
		var saveCheckedBoxesStr = "";
		var menuCustom = currentDocument.getElementById("customLogLevelsMenuContainer");
		var customChildren = menuCustom.childNodes;
		for (var i=0; i<customChildren.length; i++){
			if (customChildren[i].getAttribute("type") == "checkbox"
				&& customChildren[i].getAttribute("checked") == "true"){
				saveCheckedBoxesStr += "#" + customChildren[i].getAttribute("id");
			}
		}
		this.getPrefBranch().setCharPref("customfiltertypes", saveCheckedBoxesStr);
		//save previous filter group here
		var toggleStatusStr = currentConsoleMsgLevel + "#";
		var toggleButtons = currentDocument.getElementById("toggleButtons").childNodes;
		for (var i=0; i<toggleButtons.length; i++){
			if (toggleButtons[i].getAttribute("checked") == "true"){
				toggleStatusStr += toggleButtons[i].getAttribute("id");
				break;
			}
		}
		this.getPrefBranch().setCharPref("togglestatus", toggleStatusStr);

		//save log config
		this.getPrefBranch().setCharPref("logConfigurations", logConfigurations.toSource());
		this.getPrefBranch().setCharPref("selectedLogConfig", selectedLogConfig);
    },
	
	retrievePassword: function(path)
	{
		//this.stripHostData(path)
		var userData = { user: "", pass: ""};

		try {
		     
		    // Find users for the given parameters  
		    var logins = passwordManager.findLogins({}, this.stripHostData(path), path, null);  
			
			if (logins.length > 0){
				userData.user = logins[0].username;
				userData.pass = logins[0].password;
			}
		}  
		catch(ex) {  
		   // This will only happen if there is no nsILoginManager component class  
		}
		
		return userData;
	},
	
	setLog: function(menuitem){
		if(menuitem.getAttribute("checked") == "false"){
			this.decheckLogConfigurations();
			menuitem.setAttribute("checked", "true");
			selectedLogConfig = menuitem.getAttribute("label");
			if (!logConfigurations[selectedLogConfig].isLocal){
				//load user preferences on initialization, if the selected log config is remote
				userCredentials = this.retrievePassword(logConfigurations[selectedLogConfig].path);
			} else {
				userCredentials = null;
			}
		}
	},
	
	decheckLogConfigurations: function(){
		var configs = currentDocument.getElementById("logConfigurationsContainer").childNodes;
		for (var i=0; i<configs.length; i++){
			if (configs[i].getAttribute("type") == "checkbox"){
				configs[i].setAttribute("checked", "false");
			}
		}
	},
	
	newLogConfig: function(){
		logConfigObject = {
			local: true,
			name: "",
			path: "",
			user: "",
			pass: ""
		};
		logConfigDialog = openDialog("chrome://mlconsole/content/newLogConfig.xul", "New log configuration", "chrome=yes,menubar=no,location=no,resizable=no,scrollbars=no,dialog=yes,centerscreen=yes,height=250,width=450", logConfigObject, this);
	},
	
	editLogConfig: function(){
		logConfigObject = {
			local: logConfigurations[selectedLogConfig].isLocal,
			name: selectedLogConfig,
			path: logConfigurations[selectedLogConfig].path,
		};
		if (userCredentials != null){
			logConfigObject.user = userCredentials.user;
			logConfigObject.pass = userCredentials.pass;
		}
		logConfigDialog = openDialog("chrome://mlconsole/content/newLogConfig.xul", "Edit log configuration", "chrome=yes,menubar=no,location=no,resizable=no,scrollbars=no,dialog=yes,centerscreen=yes,height=250,width=450", logConfigObject, this);
	},
	
	saveLogConfig: function(){
		if (logConfigObject.path.length == 0){
			return ("Please enter log path!");
		} else {
			var testLogError = this.testNewLogConfig();
			if (testLogError.length == 0){
				if (!logConfigurations[logConfigObject.name].isLocal){
					//del old authentication and save new one!
					this.deletePassword(logConfigurations[logConfigObject.name].path, userCredentials.user);
					userCredentials.user = logConfigObject.user;
					userCredentials.user  = logConfigObject.pass;
					this.storePassword(logConfigurations[key].path, logConfigObject.user, logConfigObject.pass);
				}
				logConfigurations[logConfigObject.name] = {
					isLocal: logConfigObject.local,
					path: logConfigObject.path,
					user: "",
					pass: ""
				};
			} else {
				return testLogError;
			}
		}
		return "";
	},
	
	deleteLogConfig: function(){
		var hasOneConfig = true;
		var count = 0;
		for (var k in logConfigurations) {
			if (logConfigurations.hasOwnProperty(k)) {
			   ++count;
			   if (count > 1){
					hasOneConfig = false;
					break;
			   }
			}
		}
		
		if(!hasOneConfig){
			var configsContainer = currentDocument.getElementById("logConfigurationsContainer");
			var menuConfigs = configsContainer.childNodes;
			for (var i=0; i < menuConfigs.length; i++){
				if (menuConfigs[i].getAttribute("type") == "checkbox"
				  && menuConfigs[i].getAttribute("checked") == "true"){
					configsContainer.removeChild(menuConfigs[i]);
					break;
				}
			}
			//set the first log configuration as checked
			configsContainer.firstChild.setAttribute("checked", "true");
			//delete prop from skip count and config object
			if (!logConfigurations[selectedLogConfig].isLocal){//for remote configurations - also remove password from password manager
				this.deletePassword(logConfigurations[selectedLogConfig].path, userCredentials.user);
				userCredentials = null;
			}
			delete logConfigurations[selectedLogConfig];
			delete skipLogPath[selectedLogConfig];
			selectedLogConfig = configsContainer.firstChild.getAttribute("label");
			if (!logConfigurations[selectedLogConfig].isLocal){
				//load user preferences on initialization, if the selected log config is remote
				userCredentials = this.retrievePassword(logConfigurations[selectedLogConfig].path);
			}
		} else {
			alert("Deletion denied - you can not delete the last configuration!");
		}
	},
	
	addNewLogConfig: function(){
		if (logConfigObject.name.length == 0){
			return ("Please enter log name!");
		} else if (logConfigObject.path.length == 0){
			return ("Please enter log path!");
		} else if(logConfigurations[logConfigObject.name]){
			return ("This log name already exists! Enter a different log name.");
		} else {
			var testLogError = this.testNewLogConfig();
			if (testLogError.length == 0){
				logConfigurations[logConfigObject.name] = {
					isLocal: logConfigObject.local,
					path: logConfigObject.path,
					user: logConfigObject.user,
					pass: logConfigObject.pass
				};
				if (!logConfigurations[logConfigObject.name].isLocal){
					//save the user login data
					this.storePassword(logConfigurations[logConfigObject.name].path, logConfigurations[logConfigObject.name].user, logConfigurations[logConfigObject.name].pass);
					logConfigurations[logConfigObject.name].user = "";
					logConfigurations[logConfigObject.name].pass = "";
				}
				this.addLogConfiguration(logConfigurations[logConfigObject.name], logConfigObject.name);
			} else {
				return testLogError;
			}
		}
		return "";
	},
	
	testNewLogConfig: function(){
		var error = "";
		if (logConfigObject.local){
			try{
				var fileContractId = "@mozilla.org/file/local;1";
				var fileInterface = Components.interfaces.nsILocalFile;
				// Id and interface for input stream
				var inputContractId = "@mozilla.org/network/file-input-stream;1";
				var inputInterface = Components.interfaces.nsIFileInputStream;
				// Id and interface for scriptable input stream
				var sinputContractId = "@mozilla.org/scriptableinputstream;1";
				var sinputInterface = Components.interfaces.nsIScriptableInputStream;
				// Request proper security privileges
				netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
				// Path to file
				var readFilePath = logConfigObject.path;
				 
				// Get file reference
				var fileClass = Components.classes[fileContractId];
				var file = fileClass.createInstance(fileInterface);
				file.initWithPath(readFilePath);
				if (file.isDirectory()){
					return "The path points to a directory! Please enter full path, including file name at the end!";
				}
				// Get input stream
				var inputClass = Components.classes[inputContractId];
				var inputStream = inputClass.createInstance(inputInterface);
				inputStream.init(file,0x01,null, null);
				
				// Need scriptable input stream to get content
				var sinputClass = Components.classes[sinputContractId];
				var sinputStream = sinputClass.createInstance(sinputInterface);
				sinputStream.init(inputStream);
				 
				// Update log length
				skipLogPath[logConfigObject.name] = sinputStream.available();
				sinputStream.close();
				inputStream.close();
			} catch (err){
				err=err.toString();
				if (err.indexOf("NS_ERROR_FILE_UNRECOGNIZED_PATH") != -1){
					return("The path is not valid. Please check path delimiters and file location!");
				} else if (err.indexOf("NS_ERROR_FILE_ACCESS_DENIED") != -1){
					return("The current FireFox user has not enough privileges to access the file. Run FireFox with the appropriate user privileges!");
				} else if (err.indexOf("NS_ERROR_FILE_NOT_FOUND") != -1){
					return("The file does not exist!");
				} else if (err.indexOf("NS_ERROR_FILE_CORRUPTED") != -1){
					return("The file is corrupted!");
				} else return err;
			}
		} else {
			//TODO: check for solution - FireFox it has to block until the response returns!
			var client = new XMLHttpRequest();
			client.onreadystatechange = function(event) {
				if (client.readyState == 4 && client.status == 200) {
					skipLogPath[logConfigObject.name] = client.responseText.length;
				} else if (client.readyState == 4 && client.status != 200) {
					error = "Remote log is incorrect, http error " + client.status;
				}
			};
			client.open("GET", logConfigObject.path, true, logConfigObject.user, logConfigObject.pass);//TODO: asynch flag does not work in FF
			client.send(null);
		}
		return error;
	},
	
	addLogConfiguration: function(logConfig, name){
		var menuitem = currentDocument.createElement('menuitem');
		menuitem.setAttribute("label", name);
		menuitem.setAttribute("oncommand", "Firebug.MLConsoleModel.setLog(this)"); 
		menuitem.setAttribute("type", "checkbox");
		if(name == selectedLogConfig){
			menuitem.setAttribute("checked","true");
		} else {
			menuitem.setAttribute("checked","false");
		}
		menuitem.setAttribute("autocheck","false");
		currentDocument.getElementById("logConfigurationsContainer").appendChild(menuitem);
	},
	
	addToggleButton: function(severity){
		var button = currentDocument.createElement('toolbarbutton');
		button.setAttribute('label', severity.substring(0, 1).toUpperCase() + severity.substring(1) + " ");
		button.setAttribute("type", "radio"); 
		button.setAttribute("group", "ConsoleGroup");
		button.setAttribute("id","toggle-noticeui-"+severity);
		button.setAttribute("oncommand", "Firebug.MLConsoleModel.toggleConsoleGroup('noticeui-"+severity+"')");
		currentDocument.getElementById('toggleButtons').appendChild(button);
	},
	
	addStyleSheet: function(doc)
    {
        // Make sure the stylesheet isn't appended twice.
        if ($("hwStyles", doc))
            return;

        var styleSheet = createStyleSheet(doc,
            "chrome://mlconsole/skin/mlconsole.css");
        styleSheet.setAttribute("id", "hwStyles");
        addStyleSheet(doc, styleSheet);
    },
	
	getPrefBranch: function(){
		if (!prefBranch){
			prefBranch = Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefService);
			prefBranch = prefBranch.getBranch("extensions.fbmlconsole.");
		}
		return prefBranch;
	},
	
	getClipboard: function(){
		if (!clipboard){
			clipboard = Components.classes["@mozilla.org/widget/clipboardhelper;1"].  
				getService(Components.interfaces.nsIClipboardHelper);  
		}
		return clipboard;
	},
	
    showPanel: function(browser, panel) {
        isPanelOpened = panel && panel.name == panelName;
        var hwButtons = browser.chrome.$("fbToolbarVertical");
        collapse(hwButtons, !isPanelOpened);
		if (isPanelOpened){
			pendingLogMessages = 0;
			this.updateButtonMsgLabel();
		}
    },

	readRemoteLog: function(url, user, pass, isXHRRequest) {
		//TODO: Display loading or not?
		var client = new XMLHttpRequest();
		client.open("GET", url, true, user, pass);
		client.onreadystatechange = function(event) {
			if (client.readyState == 4 && client.status == 200) {
				Firebug.MLConsoleModel.previewLogData(client.responseText.substring(skipLogPath[selectedLogConfig]), isXHRRequest, false);
				skipLogPath[selectedLogConfig] = client.responseText.length;
			} else if (client.readyState == 4 && client.status != 200) {
				//TODO: Handle error - add comprehensive message
			}
		};
		client.send(null);
		
	},
	
	getBrowserFromChannel: function (aChannel) {  
	  try {  
		var notificationCallbacks =   
		  aChannel.notificationCallbacks ? aChannel.notificationCallbacks : aChannel.loadGroup.notificationCallbacks;  
	  
		if (!notificationCallbacks)  
		  return null;  
	  
		var domWin = notificationCallbacks.getInterface(Components.interfaces.nsIDOMWindow);  
		return gBrowser.getBrowserForDocument(domWin.top.document);  
	  }  
	  catch (e) {  
		dump(e + "\n");  
		return null;  
	  }  
	},
	
	
	getBrowserFromXHRChannel: function (aChannel) {  
	  try {  
		var notificationCallbacks =   
		  aChannel.loadGroup.notificationCallbacks ? aChannel.loadGroup.notificationCallbacks : aChannel.notificationCallbacks;  
	  
		if (!notificationCallbacks)  
		  return null;  
	  
		var domWin = notificationCallbacks.getInterface(Components.interfaces.nsIDOMWindow);  
		return gBrowser.getBrowserForDocument(domWin.top.document);  
	  }  
	  catch (e) {  
		dump(e + "\n");  
		return null;  
	  }  
	},
	
    viewLogPressed: function(isXHRRequest) {
		if (logConfigurations[selectedLogConfig].isLocal){
			// Id and interface for file reference
			var fileContractId = "@mozilla.org/file/local;1";
			var fileInterface = Components.interfaces.nsILocalFile;
			 
			// Id and interface for input stream
			var inputContractId = "@mozilla.org/network/file-input-stream;1";
			var inputInterface = Components.interfaces.nsIFileInputStream;
			 
			// Id and interface for scriptable input stream
			var sinputContractId = "@mozilla.org/scriptableinputstream;1";
			var sinputInterface = Components.interfaces.nsIScriptableInputStream;
			 
			// Request proper security privileges
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			
			// Path to file
			var readFilePath = logConfigurations[selectedLogConfig].path;
			 
			// Get file reference
			var fileClass = Components.classes[fileContractId];
			var file = fileClass.createInstance(fileInterface);
			file.initWithPath(readFilePath);
			 
			// Get input stream
			var inputClass = Components.classes[inputContractId];
			var inputStream = inputClass.createInstance(inputInterface);
			inputStream.init(file,0x01,null, null);
			inputStream.seek(0, skipLogPath[selectedLogConfig]);
			var sliceToNewLine = false;
			if (inputStream.available() > MEGABYTE_LENGTH){
				var skipExtra = inputStream.available() - MEGABYTE_LENGTH;
				inputStream.seek(0, skipExtra);
				skipLogPath[selectedLogConfig] += skipExtra;
				sliceToNewLine = true;
			}
			// Need scriptable input stream to get content
			var sinputClass = Components.classes[sinputContractId];
			var sinputStream = sinputClass.createInstance(sinputInterface);
			sinputStream.init(inputStream);
			 
			// Print file data

			//sinputStream.read(skipLogPath[selectedLogConfig]);
			skipLogPath[selectedLogConfig] += sinputStream.available();
			//consoletextarea.value = sinputStream.read(sinputStream.available());
			var newLogPart = sinputStream.read(sinputStream.available());
			if (sliceToNewLine){
				newLogPart = newLogPart.substring(newLogPart.indexOf("\n") + 1);
			}
			Firebug.MLConsoleModel.previewLogData(newLogPart, isXHRRequest, sliceToNewLine);
			sinputStream.close();
			inputStream.close();
		} else {
			Firebug.MLConsoleModel.readRemoteLog(logConfigurations[selectedLogConfig].path,
				userCredentials.user, userCredentials.pass, isXHRRequest);
		}
    },
	
	showAbout: function(){
		var content = ""
			+ "<img src='chrome://mlconsole/skin/kalinka64.png' style='float: left; padding-left: 30px; padding-right: 30px; padding-top: -7px'/>"
			+ "<div style='margin-left: 0px; float: left;'>"
			+ "<br/><span>Your input is highly appreciated. Please, write us at </span>"
			+ "<a href='mailto:consoleml@sirma.bg'>consoleml@sirma.bg</a></div>";
		this.openPopup("ConsoleML for Firebug, v1.0.6", content, 125);
		
	},
	
	showHelp: function(){
		//alert(window.document.location);
		var content="<div style='padding-left: 10px; float: left;'>"+
			"<ul><li style='margin-bottom: 5px;'>Check Wiki for installation instructions: <a href='http://code.google.com/p/console-ml/wiki/HowToInstall' target='new'>http://code.google.com/p/console-ml/wiki/HowToInstall</a></li>"+
			"<li style='margin-bottom: 5px;'>Check Wiki for log setup instructions: <a href='http://code.google.com/p/console-ml/wiki/LogSetup' target='new'>http://code.google.com/p/console-ml/wiki/LogSetup</a></li>"+
			"<li style='margin-bottom: 5px;'>For updates follow us on twitter: <a href='http://twitter.com/ConsoleML' target='new'>http://twitter.com/ConsoleML</a></li>"+
			"<span style='display: block; margin-left: -30px'>Your input is highly appreciated. If you have any problems, please write us at <a href='mailto:consoleml@sirma.bg'>consoleml@sirma.bg</a></span>"+
			"</div>";
		this.openPopup("Help", content, 160);
	},
	
	copyToClipboard: function(text){
		text = text.replace(/\n/gm, "\r\n");//workaround for properly displaying line breaks in Microsoft Windows Notepad
		this.getClipboard().copyString(text);
	},
	
	copyLog: function(copyAll){
		var copytxt = "";
		var mlpanel = Firebug.currentContext.getPanel(panelName);
		if (mlpanel){
			var panelChildren = mlpanel.panelNode.childNodes;
			for (i=0; i<panelChildren.length; i++){
				
				var divHidden = false;
				if (panelChildren[i].getAttribute("style") != null)
					divHidden = (panelChildren[i].getAttribute("style").toLowerCase().indexOf("display: none") != -1);
				var divMessage = (panelChildren[i].getAttribute("class").indexOf("noticeui-message") != -1);
				if (!divMessage){
					if (copyAll || (!copyAll && !divHidden)){//continue if we have to copy all messages or if we have to copy only filtered messages AND the div is not hidden
						var divChildren = panelChildren[i].childNodes[1].childNodes;
						for (j=0; j<divChildren.length; j++){
							if (divChildren[j].nodeName.toUpperCase() == "P"){
									copytxt += divChildren[j].textContent+"\n";
								}
						}
					}
				}
			}
			this.copyToClipboard(copytxt);
		}
	},
	
	tryUpdateLogAfterXHR : function(){
		updateRequestsWaiting--;
		if (updateRequestsWaiting == 0){
			var logSkipBeforeUpdate = skipLogPath[selectedLogConfig];
			Firebug.MLConsoleModel.viewLogPressed(true);
			var newLogMessagesFound = (logSkipBeforeUpdate != skipLogPath[selectedLogConfig]);
			var detachedOnTop = false;
			if (wwatch.activeWindow.location == FIREBUG_OVERLAY_LOCATION){
				detachedOnTop = true;
			}
			if (!isPanelOpened){
				//store the event in the log count and show it in the ladybug button
				if (newLogMessagesFound)
					pendingLogMessages++;
			} else {
				if (Firebug.isDetached() && !detachedOnTop){//MLConsole panel is opened, but it's in detached mode and not on top of the other window
					if (newLogMessagesFound)
						pendingLogMessages++;
				} else {
					pendingLogMessages = 0;
				}
			}
			Firebug.MLConsoleModel.updateButtonMsgLabel();
		}
	},
	
	updateButtonMsgLabel: function(){
		if (pendingLogMessages == 0){
			window.document.getElementById("toolbar-consoleml-stack").setAttribute("mlLogCount", "0");
		} else if (pendingLogMessages >= 10){
			window.document.getElementById("toolbar-consoleml-stack").setAttribute("mlLogCount", "11");
		} else {
			window.document.getElementById("toolbar-consoleml-stack").setAttribute("mlLogCount", "1");
		}
		window.document.getElementById("toolbar-consoleml-label").value = pendingLogMessages;
		if (isMLServer){
			window.document.getElementById("toolbar-consoleml-button").setAttribute("image", "chrome://mlconsole/skin/ladybug16_2.png");
		} else {
			window.document.getElementById("toolbar-consoleml-button").setAttribute("image", "chrome://mlconsole/skin/ladybug16_2_bw.png");
		}
	},
	
	clearLog: function(){
		var mlpanel = Firebug.currentContext.getPanel(panelName);
		if (mlpanel)
			mlpanel.clearLog();
	},
	
	selectToggleButton: function(toggleId){
		var toggleCheck = currentDocument.getElementById(toggleId);
		var classType = toggleCheck.getAttribute("class").substring("noticeui-".length);
		if (toggleCheck.getAttribute("checked") == "true"){
			this.addToggleButton(classType);
		} else {
			var toggleButton = currentDocument.getElementById("toggle-noticeui-"+classType);
			if (toggleButton.getAttribute("checked") == "true"){
				currentConsoleMsgLevel = LEVEL_CUSTOM;
				currentDocument.getElementById("toggleCustom").setAttribute("checked", "true");
				this.showCustomConsoleGroups();
			}
			currentDocument.getElementById("toggleButtons").removeChild(toggleButton);
		}
	},

	updateToggleButtons: function(){
		var toggleChecks = currentDocument.getElementById("customLogLevelsMenuContainer").childNodes;
		for (var i=0; i< toggleChecks.length; i++){
			if (toggleChecks[i].getAttribute("type") == "checkbox"){
				var classType = toggleChecks[i].getAttribute("class").substring("noticeui-".length);
				if (toggleChecks[i].getAttribute("checked") == "true"){
					if (currentDocument.getElementById("toggle-noticeui-"+classType) == null){
						this.addToggleButton(classType);
					}
				} else {
					if (currentDocument.getElementById("toggle-noticeui-"+classType) != null){
						var toggleButton = currentDocument.getElementById("toggle-noticeui-"+classType);
						if (toggleButton.getAttribute("checked") == "true"){
							currentConsoleMsgLevel = LEVEL_CUSTOM;
							currentDocument.getElementById("toggleCustom").setAttribute("checked", "true");
							this.showCustomConsoleGroups();
						}
						currentDocument.getElementById("toggleButtons").removeChild(toggleButton);
					}
				}
			}
		}
	},
	
	showCustomLevelplus: function(){
		this.decheckToggleButtons();
		currentDocument.getElementById("toggleCustom").setAttribute("checked", "true");
	},
	
	hideCustomLevelPlus: function(){
		if(currentConsoleMsgLevel == LEVEL_CUSTOM){
			this.showCustomConsoleGroups();
		}
	},
	
	levelPlusMenu: function(){
		currentConsoleMsgLevel = LEVEL_CUSTOM;
		this.showCustomConsoleGroups();
	},
	
	decheckToggleButtons: function(){
		var toggleButtons = currentDocument.getElementById("toggleButtons").childNodes;
		for (var i=0; i<toggleButtons.length; i++){
			toggleButtons[i].setAttribute("checked", "false");
		}
	},
	
	toggleConsoleGroup: function(groupClass){
		currentConsoleMsgLevel = LEVEL_TOGGLE;
		this.showConsoleGroup(groupClass);
	},
	
	showConsoleGroup: function(groupClass){
		var panel = Firebug.currentContext.getPanel(panelName);
		if (panel){
			var panelChildren = panel.panelNode.childNodes;
			for (i=0; i<panelChildren.length; i++){
				if (groupClass === panelChildren[i].getAttribute("class").split(" ")[1]){
					panelChildren[i].setAttribute("style", "");
				} else {
					panelChildren[i].setAttribute("style", "display: none");
				}
			}
		}
	},
	
	hideLastConsoleGroup: function(){
		var panel = Firebug.currentContext.getPanel(panelName);
		if (panel){
			panel.panelNode.lastChild.setAttribute("style", "display: none");
		}
	},
	
	showAllConsoleGroups: function(){
		var panel = Firebug.currentContext.getPanel(panelName);
		if (panel){
			var panelChildren = panel.panelNode.childNodes;
			for (i=0; i<panelChildren.length; i++){
				panelChildren[i].setAttribute("style", "");
			}
		}
	},
	
	showCustomConsoleGroups: function(){
		var customClassNames = "";
		var customChecks = currentDocument.getElementById("customLogLevelsMenuContainer").childNodes;
		for (var i=0; i<customChecks.length; i++){
			if (customChecks[i].getAttribute("checked") == "true"){
				customClassNames += (customChecks[i].getAttribute("class") + "#");
			}
		}
		var panel = Firebug.currentContext.getPanel(panelName);
		if (panel){
			var panelChildren = panel.panelNode.childNodes;
			var tst;
			for (var i=0; i<panelChildren.length; i++){
				if (customClassNames.indexOf(panelChildren[i].getAttribute("class").split(" ")[1] + "#") == -1){
					panelChildren[i].setAttribute("style", "display: none");
				} else {
					panelChildren[i].setAttribute("style", "");
				}
			}
		}		
	},
	
	viewWholeLog: function(){
		this.clearLog();
		skipLogPath[selectedLogConfig] = 0;
		this.viewLogPressed(false);
	},
	
	previewLogData: function(data, isXHRRequest, bigLog){
		var allrows = data.split("\n");

		var currentRows = new Array();
		var currentLogType = "";
		var prevLogType = "";
		var logPrinted = false;
		for (var i = 0; i < allrows.length; i++){
			if (allrows[i] != ""){
				if (allrows[i].indexOf(LOG_INFO) != -1){
					currentLogType = LOG_INFO; 
				} else if (allrows[i].indexOf(LOG_WARNING) != -1){
					currentLogType = LOG_WARNING;
				} else if (allrows[i].indexOf(LOG_NOTICE) != -1){
					currentLogType = LOG_NOTICE;
				} else if (allrows[i].indexOf(LOG_FINEST) != -1){
					currentLogType = LOG_FINEST;
				} else if (allrows[i].indexOf(LOG_FINER) != -1){
					currentLogType = LOG_FINER;
				} else if (allrows[i].indexOf(LOG_FINE) != -1){
					currentLogType = LOG_FINE;
				} else if (allrows[i].indexOf(LOG_DEBUG) != -1){
					currentLogType = LOG_DEBUG;
				} else if (allrows[i].indexOf(LOG_CONFIG) != -1){
					currentLogType = LOG_CONFIG;
				} else if (allrows[i].indexOf(LOG_ERROR) != -1){
					currentLogType = LOG_ERROR;
				} else if (allrows[i].indexOf(LOG_CRITICAL) != -1){
					currentLogType = LOG_CRITICAL;
				} else if (allrows[i].indexOf(LOG_ALERT) != -1){
					currentLogType = LOG_ALERT;
				} else if (allrows[i].indexOf(LOG_EMERGENCY) != -1){
					currentLogType = LOG_EMERGENCY;
				}
				else { //the row has the same type as its predecessor
					currentLogType = prevLogType;
				}
				
				if (prevLogType === ""){ // should happen only on the first row of the log that is being parsed
					prevLogType = currentLogType;
				}
				
				if (prevLogType !== currentLogType){
					//output the current buffer and start filling it again for the new output group type
					Firebug.MLConsoleModel.printLogGroup(prevLogType, currentRows);
					logPrinted = true;
					currentRows = new Array();
				}
				currentRows[currentRows.length] = allrows[i];
				prevLogType = currentLogType;
			}
		}
		if (currentRows.length > 0){
			Firebug.MLConsoleModel.printLogGroup(prevLogType, currentRows);
			logPrinted = true;
		}
		if (!logPrinted){
			var logMessage = "";
			if(isXHRRequest)
				logMessage = NO_RESULTS_AJAX_MSG;
			else
				logMessage = NO_RESULTS_MSG;
			Firebug.MLConsoleModel.printLogGroup(LOG_MESSAGE, [logMessage]);
		}
		//alert that the log is bigger than 1 MB
		if(bigLog){
			Firebug.MLConsoleModel.printLogGroup(LOG_MESSAGE, ["The log is too big to be displayed. Showing only last 1 Megabyte of log data!"]);
		}
		//try to scroll to bottom
		var panel = Firebug.currentContext.getPanel(panelName);
		if (panel){
			var panelElement = panel.panelNode;
			panelElement.scrollTop = panelElement.scrollHeight
		}
	},
	
	printLogGroup: function(prevLogType, currentRows){
	if (currentRows.length > 0){
		var panel = Firebug.currentContext.getPanel(panelName);
		var parentNode = panel.panelNode;
		var hideLast = false;
		var logType = prevLogType.split(":")[0].toLowerCase();
		var outputGroup = mlConsoleTemplate[logType];
		if(prevLogType != LOG_MESSAGE){
			if (currentConsoleMsgLevel == LEVEL_TOGGLE){
				var logClass = "noticeui-"+logType;
				var toggleButton = currentDocument.getElementById("toggle-noticeui-"+logType);
				if ((toggleButton == null) || (toggleButton.getAttribute("checked") != "true")){
					hideLast = true;
				}
			} else if (currentConsoleMsgLevel == LEVEL_CUSTOM){
				var checkboxId = "checknoticeui-"+logType;
				var checked = currentDocument.getElementById(checkboxId).getAttribute("checked");
				if (checked != "true"){
					hideLast = true;
				}
			}
		}
		outputGroup.append({rows: currentRows}, parentNode, mlConsoleTemplate);
		if (hideLast)
			this.hideLastConsoleGroup();
	}
	},
	
	printDebugInfo: function(debugRows){
	if (debugRows.length > 0){
		var panel = Firebug.currentContext.getPanel(panelName);
		var parentNode = panel.panelNode;
		mlConsoleTemplate.message.append({rows: debugRows}, parentNode, mlConsoleTemplate);
	}
	},
	
	selectDefaultLogLevels: function(menuid){
		this.selectNoneMenu(menuid);
		currentDocument.getElementById("checknoticeui-info").setAttribute("checked", "true");
		currentDocument.getElementById("checknoticeui-warning").setAttribute("checked", "true");
		currentDocument.getElementById("checknoticeui-notice").setAttribute("checked", "true");
		//update toggle buttons too
		this.updateToggleButtons();
		
	},
	
	selectAllMenu: function(menuid){
		var menuCustom = currentDocument.getElementById(menuid);
		var customChildren = menuCustom.childNodes;
		for (var i=0; i<customChildren.length; i++){
			if (customChildren[i].getAttribute("type") == "checkbox"){
				customChildren[i].setAttribute("checked", "true");
			}
		}
	},
	
	selectNoneMenu: function(menuid){
		var menuCustom = currentDocument.getElementById(menuid);
		var customChildren = menuCustom.childNodes;
		for (var i=0; i<customChildren.length; i++){
			if (customChildren[i].getAttribute("type") == "checkbox"){
				customChildren[i].setAttribute("checked", "false");
			}
		}
	},
	
	reattachContext: function(browser, context)
    {
        var panel = context.getPanel(panelName);
        this.addStyleSheet(panel.document);
		var src;
		var target;
		//var wenum = wwatch.getWindowEnumerator();
		//while ()
		if(Firebug.chrome.window != window){//detaching Firebug
			src = window.document;
			target = Firebug.chrome.window.document;
			currentDocument = Firebug.chrome.window.document;
			Firebug.chrome.window.document.getElementById("firebug").setAttribute("onfocus", "Firebug.MLConsoleModel.clearLabelOnDetachedFocus()");
		} else { // attaching FB back
			src = currentDocument;
			target = window.document;
			currentDocument = Firebug.chrome.window.document;
		}
		
		this.cloneChildren(src.getElementById("logConfigurationsContainer"), target.getElementById("logConfigurationsContainer"));
		//this.cloneChildren(src.getElementById("checktoggle-menuContainer"), target.getElementById("checktoggle-menuContainer"));
		this.cloneChildren(src.getElementById("toggleButtons"), target.getElementById("toggleButtons"));
		
    },
	
	clearLabelOnDetachedFocus: function(){
		if (isPanelOpened){
			pendingLogMessages = 0;
			Firebug.MLConsoleModel.updateButtonMsgLabel();
		}
	},
	
	cloneChildren: function(src, target){
		while (target.hasChildNodes()) {
			target.removeChild(target.lastChild);
		}
		var srcChildren = src.childNodes;
		for (var i=0; i < srcChildren.length; i++){
			var clone = srcChildren[i].cloneNode(true);
			target.appendChild(clone);
		}
	},
	
	openPopup: function(title, content, divheight) {
		var container = currentDocument.getElementById('popup-modal');
		if(container) {
			container.style.display = 'block';
		} else {
			var popuphtml = this.buildHtml(title, content, divheight);
			var popupModal = Firebug.currentContext.getPanel(panelName).panelNode.ownerDocument.getElementById("popup-modal");
			if (popupModal){
				popupModal.parentNode.removeChild(popupModal);
				var customPopup = Firebug.currentContext.getPanel(panelName).panelNode.ownerDocument.getElementById("custom-popup");
				customPopup.parentNode.removeChild(customPopup);
			}
			Firebug.currentContext.getPanel(panelName).panelNode.innerHTML += popuphtml;			
		}
	},

	buildHtml: function(title, content, divheight) {
		var inlineStyleParent="";
		var inlineStyleChild="";
		if (divheight){
			
			inlineStyleParent= ' style="height:' + divheight + 'px; margin-top: -' + (divheight/2) + 'px;" ';
			inlineStyleChild= ' style=" height:' + (divheight-35) + 'px" ';
		}
		var onclick = "var overlay = document.getElementById('popup-modal'); overlay.parentNode.removeChild(overlay);";
		onclick += "var panel = document.getElementById('custom-popup'); panel.parentNode.removeChild(panel);";
		var html = '<div id="popup-modal" onclick="'+onclick+'"></div>';
		html += '<div id="custom-popup"' + inlineStyleParent + '>';
		html += '<h4 id="popup-title"><img src="chrome://mlconsole/skin/ladybug16_2.png" style="float: left; padding-left: 5px;  padding-right: 3px;"/>' + title;
		html += '<span id="popup-close-button"><a href="#" onclick="'+onclick+'">x</a></span>';
		html += '</h4>';
		html += '<div id="popup-content" ' + inlineStyleChild + '>';
		html += content;
		html += '</div></div>';
		return html;
	},
	
    /**
     * Appends ConsoleML start button into Firefox toolbar automatically on browser startup.
     */
    appendToToolbar: function()
    {
        // Get the current navigation bar button set (a string of button IDs) and append
        // ID of the ConsoleML start button into it.
        var startButtonId = "toolbar-consoleml-box";
        var navBarId = "nav-bar";
        var navBar = top.document.getElementById(navBarId);
        var currentSet = navBar.currentSet;
        // Append only if the button is not already there.
        var curSet = currentSet.split(",");
        if (curSet.indexOf(startButtonId) == -1)
        {
            navBar.insertItem(startButtonId);
            navBar.setAttribute("currentset", navBar.currentSet);
            document.persist("nav-bar", "currentset");

            try
            {
                // The current global scope is not browser.xul.
                top.BrowserToolboxCustomizeDone(true);
            }
            catch (e)
            {
				
            }
        }

    },
	
    focusOnPanel: function()
    {
		if(isPanelOpened)//if not opened, open and focused on our panel
			Firebug.toggleBar(false, panelName);
		else //if opened, close the panel
			Firebug.toggleBar(true, panelName);
    },
	
	initModelListeners: function(){
		if (mlWebProgressListener == null){
			mlWebProgressListener =  
			{
			  QueryInterface: function(aIID)  
			  {  
			   if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||  
				   aIID.equals(Components.interfaces.nsISupportsWeakReference) ||  
				   aIID.equals(Components.interfaces.nsISupports))  
				 return this;  
			   throw Components.results.NS_NOINTERFACE;  
			  },
			  
			  onStateChange: function(aWebProgress, aRequest, aFlag, aStatus)  
			  {
			   // If you use myListener for more than one tab/window, use  
			   // aWebProgress.DOMWindow to obtain the tab/window which triggers the state change
			   
				   if((aFlag & Components.interfaces.nsIWebProgressListener.STATE_START)
				   && (aWebProgress.DOMWindow == aWebProgress.DOMWindow.top))
				   {
						waitingForPage = this.stripProtocolFromURI(aRequest.name);
					 // This fires when the load event is initiated
				   }
				   if((aFlag & Components.interfaces.nsIWebProgressListener.STATE_STOP))
				   {
						var mlVisitor = new mlHttpHeaderVisitor();
						if(aRequest.visitResponseHeaders)
							aRequest.visitResponseHeaders(mlVisitor);
						if (!isMLServer && mlVisitor.isMLServer()){
							isMLServer = true;
							//the picture of the ladybug should be the colored one, not B&W
							currentDocument.getElementById("toolbar-consoleml-button").setAttribute("image", "chrome://mlconsole/skin/ladybug16_2.png");
						}
					    if (waitingForPage == this.stripProtocolFromURI(aRequest.name)){
							waitingForPage = "";
							updateRequestsWaiting = 0;
							xhrRequests = { count: 0 };
							if (mlVisitor.isMLServer()){
								var logSkipBeforeUpdate = skipLogPath[selectedLogConfig];
								Firebug.MLConsoleModel.viewLogPressed(false);
								var newLogMessagesFound = (logSkipBeforeUpdate != skipLogPath[selectedLogConfig]);
								var detachedOnTop = false;
								if (wwatch.activeWindow.location == FIREBUG_OVERLAY_LOCATION){
									detachedOnTop = true;
								}
								if (!isPanelOpened){
									//store the event in the log count and show it in the ladybug button
									if (newLogMessagesFound)
										pendingLogMessages++;
									
								} else {
									if (Firebug.isDetached() && !detachedOnTop){//MLConsole panel is opened, but it's in detached mode and not on top of the other window
										if (newLogMessagesFound)
											pendingLogMessages++;
									} else {
										pendingLogMessages = 0;
									}
								}
								Firebug.MLConsoleModel.updateButtonMsgLabel();
							} else {
								if (isMLServer){//user goes from ML page to non-ML page
									isMLServer = false;
									pendingLogMessages = 0;
									Firebug.MLConsoleModel.updateButtonMsgLabel();
								}
							}
						}
				    }
			   
			  },
			  
			  stripProtocolFromURI: function(uri){
				return uri.substring(uri.indexOf("://") + "://".length);
			  },
			  
			  onLocationChange: function(aProgress, aRequest, aURI)  
			  {  
			   // This fires when the location bar changes; that is load event is confirmed  
			   // or when the user switches tabs. If you use myListener for more than one tab/window,  
			   // use aProgress.DOMWindow to obtain the tab/window which triggered the change.  
			  },  
			  
			  // For definitions of the remaining functions see related documentation  
			  onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) { },  
			  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) { },  
			  onSecurityChange: function(aWebProgress, aRequest, aState) { }  
			};
			window.getBrowser().addProgressListener(mlWebProgressListener, Components.interfaces.nsIWebProgress.STATE_IS_WINDOW);
			
			//************************************* XHR request listeners *********************************************************************
			
			respXHRListener = {

				observe: function(request, aTopic, aData){

				if (currentTab == null){//init the current tab variable if it's still null! This is done upon first successfull browser request
					currentTab = gBrowser.getBrowserForTab(gBrowser.selectedTab);
				}
				try {
					if (typeof Cc == "undefined") {
						var Cc = Components.classes;
					}
					if (typeof Ci == "undefined") {
						var Ci = Components.interfaces;
					}
					if (aTopic == "http-on-examine-response" && isMLServer) {
						if (this.isXHR(request) && waitingForPage == "") {
							if (xhrRequests[request.originalURI.path]){
								//true only if the XHR request was made after page load
								xhrRequests.count--;
								if(xhrRequests.count == 0){
									//all XHR requests after page load finished, so refresh the console and reset xhr observer object
									xhrRequests = { count: 0 };
									updateRequestsWaiting++;
									setTimeout("Firebug.MLConsoleModel.tryUpdateLogAfterXHR();", 1000);
								}
							}
						}
					}
				} catch (e) {
					dump("\nhRO error: \n\tMessage: " + e.message + "\n\tFile: " + e.fileName + "  line: " + e.lineNumber + "\n");
				}
				
				},

				QueryInterface: function(aIID){
					if (typeof Cc == "undefined") {
						var Cc = Components.classes;
					}
					if (typeof Ci == "undefined") {
						var Ci = Components.interfaces;
					}
					if (aIID.equals(Ci.nsIObserver) ||
					aIID.equals(Ci.nsISupports)) {
						return this;
					}

					throw Components.results.NS_NOINTERFACE;

				},

				isXHR: function(request)
				{
					try
					{
						var callbacks = request.notificationCallbacks;
						var xhrRequest = callbacks ? callbacks.getInterface(Ci.nsIXMLHttpRequest) : null;
						return (xhrRequest != null);
					}
					catch (exc)
					{
						//alert("error!!!"+exc);
					}
						return false;
				}
			};

			reqXHRListener = {

				observe: function(request, aTopic, aData){
					try {
						if (typeof Cc == "undefined") {
							var Cc = Components.classes;
						}
						if (typeof Ci == "undefined") {
							var Ci = Components.interfaces;
						}
						if (aTopic == "http-on-modify-request" && isMLServer) {
							request.QueryInterface(Ci.nsIHttpChannel);
							var remotePath = Firebug.MLConsoleModel.getPrefBranch().getCharPref("remotelogpath");
							//Firebug.MLConsoleModel.printDebugInfo(["Request is: -> "+this.isXHR(request) + " - "+ request.originalURI.path]);
							if (this.isXHR(request) && (waitingForPage == "") && (remotePath.indexOf(request.originalURI.path) == -1)) {
								var requestbrowser = Firebug.MLConsoleModel.getBrowserFromXHRChannel(request);
								var thisBrowser = gBrowser.getBrowserForTab(gBrowser.selectedTab);
								//Firebug.MLConsoleModel.printDebugInfo(["Browser is: -> "+(currentBrowser == requestbrowser) + " - "+ request.originalURI.path]);
								if (thisBrowser == requestbrowser){
									xhrRequests.count++;
									xhrRequests[request.originalURI.path] = true;
								}
							}
						} 
					} catch (e) {
						dump("\reqListener error: \n\tMessage: " + e.message + "\n\tFile: " + e.fileName + "  line: " + e.lineNumber + "\n");
					}
				},

				QueryInterface: function(aIID){
					if (typeof Cc == "undefined") {
						var Cc = Components.classes;
					}
					if (typeof Ci == "undefined") {
						var Ci = Components.interfaces;
					}
					if (aIID.equals(Ci.nsIObserver) ||
					aIID.equals(Ci.nsISupports)) {
						return this;
					}

					throw Components.results.NS_NOINTERFACE;

				},

				isXHR: function(request)
				{
					try
					{
						var callbacks = request.notificationCallbacks;
						var xhrRequest = callbacks ? callbacks.getInterface(Ci.nsIXMLHttpRequest) : null;
						return (xhrRequest != null);
					}
					catch (exc)
					{
						
					}
						return false;
				},
				
				getXHRChannel: function(request)
				{
					try
					{
						var callbacks = request.notificationCallbacks;
						var xhrRequest = callbacks ? callbacks.getInterface(Ci.nsIXMLHttpRequest) : null;
						return xhrRequest.channel;
					}
					catch (exc)
					{
						
					}
						return null;
				}

			};
			
			var container = gBrowser.tabContainer;  
			container.addEventListener("TabSelect", otherTabSelected, false);
			
			var observerService = Cc["@mozilla.org/observer-service;1"]
				.getService(Ci.nsIObserverService);

			observerService.addObserver(respXHRListener,
				"http-on-examine-response", false);
				
			observerService.addObserver(reqXHRListener,
				"http-on-modify-request", false);
		}
	}
	
	
};

Firebug.MLConsoleModel = extend(Firebug.Module,
mlmodel
);

var mlHttpHeaderVisitor = function ( ) {  
        this._isMLServer = false;  
};  
mlHttpHeaderVisitor.prototype.visitHeader = function ( aHeader, aValue ) {  
        if ( aHeader.indexOf( "Server" ) !== -1 ) {  
            if ( aValue.indexOf( ML_SERVER_HEADER ) !== -1 ) {  
                this._isMLServer = true;  
            }  
        }  
};  
mlHttpHeaderVisitor.prototype.isMLServer = function ( ) {  
    return this._isMLServer;  
};  

var mlconsolepanel = {
    name: panelName,
    title: "ConsoleML",
	
	debugprops: function(obj, objName) {
	   var result = ""; 
	   for (var i in obj) { 
		  result += objName + "." + i + " = " + obj[i] + "\n"; 
	   } 
	   return result; 
	},
	
    initialize: function() {
        Firebug.Panel.initialize.apply(this, arguments);
		Firebug.MLConsoleModel.addStyleSheet(this.document);		
    },
	
	clearLog: function()
    {
        if (this.panelNode)
        {
            this.panelNode.innerHTML = "";
        }
    },
	
	setContent: function(content)
    {
        if (this.panelNode)
        {
            this.panelNode.innerHTML = content;
        }
    }
	
};

function MLConsolePanel() {}
MLConsolePanel.prototype = extend(Firebug.Panel,
mlconsolepanel
);

Firebug.registerModule(Firebug.MLConsoleModel);
Firebug.registerPanel(MLConsolePanel);

}});