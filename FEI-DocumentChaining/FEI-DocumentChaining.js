define(['jquery', 'qlik', 'angular', 'ng!$q', 'css!./FEI-DocumentChaining.css'], function ($, qlik, angular, $q) {

    return {
        //define the properties panel looks like
        definition: {
            type: "items",
            component: "accordion",
            items: {
                redirectSettings: {
                    type: "items",
                    label: "Redirect Settings",
                    items: {
                        appID: {
                            ref: "appID",
                            type: "string",
                            label: "App ID",
                            defaultValue: "98f15657-7610-4f17-8e09-8a38ff69be85",
                            show: true
                        },
                        sheetID: {
                            ref: "sheetID",
                            type: "string",
                            label: "Sheet ID",
                            defaultValue: "ChEKGhw",
                            show: true
                        },
                        appName: {
                            ref: "documentName",
                            type: "string",
                            label: "Button Label",
                            defaultValue: "2013",
                            show: true
                        },
                        carrySelections: {
                            ref: "carrySelections",
                            component: "switch",
                            type: "boolean",
                            label: "Carry Selections",
                            options: [{
                                value: true,
                                label: "On"
                            },{
                                value: false,
                                label: "Off"
                            }],
                            defaultValue: true,
                            show: true
                        },
                        sameOrNewTab: {
                            ref: "sameOrNewTab",
                            component: "switch",
                            type: "boolean",
                            label: "Redirect to Same or New Tab",
                            options: [{
                                value: true,
                                label: "New Tab"
                            },{
                                value: false,
                                label: "Same Tab"
                            }],
                            defaultValue: true,
                            show: true
                        }
                    }
                },
                ExtensionSettings: {
                    type: "items",
                    label: "Extension Settings",
                    items: {
                        maxSelected: {
                            ref: "maxSelected",
                            type: "integer",
                            label: "Max Values Selected in One Field",
                            defaultValue: "100",
                            min: 1
                        },
                        urlResolver: {
                            ref: "urlResolver",
                            type: "string",
                            label: "URL Resolver Mashup Link",
                            defaultValue: "extensions/FEI-DocumentChaining/FEI-DocumentChainingURLResolver/FEI-DocumentChainingURLResolver.html"
                        }
                    }
                }
            }
        },

        paint: function ($element, layout, jquery) {
            var self = this;

            //Defining the separators used in GetCurrentSelections function call
            var recordSeparator = '&@#$^()';
            var tagSeparator = '::::';
            var valueSeparator = ';;;;';

            //For IE that doesn't recognize the "includes" function
            if (!String.prototype.includes) {
                String.prototype.includes = function(search, start) {
                    'use strict';
                    if (typeof start !== 'number') {
                        start = 0;
                    }

                    if (start + search.length > this.length) {
                        return false;
                    } else {
                        return this.indexOf(search, start) !== -1;
                    }
                };
            }

            //Obtaining the global object to use it for generating the first part of the App Integration API's URI (host/ip, app id, sheet id)
            var config = {
                host: window.location.hostname,
                prefix: window.location.pathname.substr(0, window.location.pathname.toLowerCase().lastIndexOf("/extensions") + 1),
                port: window.location.port,
                isSecure: window.location.protocol === "https:"
            };
            var global = qlik.getGlobal(config);


            //Getting the current application
            var app = qlik.currApp(this);
            var applicationId = layout.appID;
            if(applicationId!=null){            
                if (applicationId.substring(applicationId.length - 4) == '.qvf') {
                    applicationId = applicationId.slice(0, -4);
                }
            }

            var applicationIdFr = encodeURIComponent(applicationId);
            var SheetID = layout.sheetID;

            /*Creating base part of URL including clearing any leftover 
            selections before opening the new page with our selections*/
            var baseURL = (config.isSecure ? "https://" : "http://" ) + config.host + (config.port ? ":" + config.port : "" ) + "/sense/app/" + applicationIdFr + "/sheet/" + SheetID + "/state/analysis/options/clearselections";


            var buttonHTMLCode = '<button name="'+'GenerateDashboardLink'+layout.qInfo.qId+'" id="generateDashboardLink'+ layout.qInfo.qId + '" class="documentChaining">'+layout.documentName+'</button>';
            $element.html(buttonHTMLCode);

            //If in edit mode, do nothing
            if(window.location.pathname.includes("/state/edit"))
                return;

            //Making sure the maximum selected values in a field is at least one
            var maxValuesSelectedInField = layout.maxSelected;
            maxValuesSelectedInField = maxValuesSelectedInField<1?1:maxValuesSelectedInField;

            //Create a hypercube with the GetCurrentSelections expression
            app.createCube({
                qMeasures : [
                    {
                        qDef : {
                            qDef : "=GetCurrentSelections('"+recordSeparator+"','"+tagSeparator+"','"+valueSeparator+"',"+maxValuesSelectedInField+")"
                        }
                    }
                ],
                qInitialDataFetch : [{
                    qTop : 0,
                    qLeft : 0,
                    qHeight : 1,
                    qWidth : 1
                }]
            }, function(reply) {
                console.log('App Integration API\'s reply is: ', reply);
                //If the app's reply is not empty
                if(reply.qHyperCube.qDataPages[0].qMatrix[0][0].qText && reply.qHyperCube.qDataPages[0].qMatrix[0][0].qText != '-') {
                    //Split the app's reply using the recordSeparator
                    var fieldSelections = reply.qHyperCube.qDataPages[0].qMatrix[0][0].qText.split(recordSeparator);
                    //console.log('Number of characters in the selections:',fieldSelections[0].length);
                    //If the array of split selected fields is more than zero
                    if (fieldSelections.length > 0) {
                        //Create a part of the App Integration API's URI responsible for selections
                        var selectionPartOfURL = createSelectionsURLPart(fieldSelections,tagSeparator,valueSeparator,true); 
                        if(selectionPartOfURL.tooManySelectionsPossible){
                            //console.log("Possible 'x of y values' returned. Need to double check. These dimensions are suspected: "+selectionPartOfURL.suspectedFields);
                            //If tooManySelections is possible, then create a new hypercube with the number of selections of the suspected fields
                            var measuresDef = [];
                            selectionPartOfURL.suspectedFields.forEach(function(field){
                                var measureDefinition = {
                                    qDef : {
                                        qDef : "=GetSelectedCount(["+field+"],True())"
                                    }
                                };
                                measuresDef.push(measureDefinition);
                            });
                            app.createCube({
                                qMeasures : measuresDef,
                                qInitialDataFetch : [{
                                    qTop : 0,
                                    qLeft : 0,
                                    qHeight : 1,
                                    qWidth : selectionPartOfURL.suspectedFields.length
                                }]
                            }, function(reply) {
                                var tooManySelectionsMade = false;
                                reply.qHyperCube.qDataPages[0].qMatrix[0].forEach(function (suspectedSelection) {
                                    //check if the number of selected values is > "Max number of values selected in one field" property
                                    if(parseInt(suspectedSelection.qText) > layout.maxSelected)
                                        tooManySelectionsMade = true;
                                });
                                if(tooManySelectionsMade) {
                                    //If this is the case for at least one field, disable the button
                                    $("#generateDashboardLink" + layout.qInfo.qId).text("Too Many Selections");
                                    $("#generateDashboardLink" + layout.qInfo.qId).prop("disabled",true);
                                }
                                else {
                                    //Considering it a false alarm (for example some field has actual value that follows the "x of y" pattern); activate the button
                                    var selectionPartOfURL = createSelectionsURLPart(fieldSelections,tagSeparator,valueSeparator,false);
                                    if(layout.carrySelections){
                                        activateButtonEvent($element,config,layout,baseURL+selectionPartOfURL.selectionURLPart);
                                    }
                                    else{
                                        activateButtonEvent($element,config,layout,baseURL);
                                    }

                                }
                            }); //end of tooManySelections hypercube
                        } //end of tooManySelections possibility
                        else { 
                            //If there's no possibility of too many selections, activate the button with the selections part added to the baseURL
                            if(layout.carrySelections){
                                activateButtonEvent($element,config,layout,baseURL+selectionPartOfURL.selectionURLPart);
                            }
                            else{
                                activateButtonEvent($element,config,layout,baseURL);
                            }
                        }
                    } //end of if split selected fields is zero
                    else{
                        //If the array of split selected fields is zero, activate the button with no selections added to the baseURL
                        activateButtonEvent($element,config,layout,baseURL);
                    }
                } //end of if App Integration API's reply is empty
                else{
                    //If the app's reply is empty, activate the button with no selections added to the baseURL
                    activateButtonEvent($element,config,layout,baseURL);
                }
            }); //end of reply and createCube
        }
    };
}); 


//Helper function for creating App Integration API's URI part responsible for selections
var createSelectionsURLPart = function (fieldSelections,tagSeparator,valueSeparator,checkForTooManySelections) {
    var returnObject = {
        selectionURLPart : "",
        tooManySelectionsPossible : false,
        suspectedFields : []
    };
    fieldSelections.forEach(function (item) {
        //If this function is instructed to check for tooManySelections, it checks if the selection contains the keywords of, ALL, or NOT, indicating that the selection is not in the 'x of y values' format
        if (checkForTooManySelections && (item.includes(" of ") || item.includes("ALL") || item.includes("NOT")) && item.split(valueSeparator).length == 1) {
            returnObject.tooManySelectionsPossible = true;
            returnObject.suspectedFields.push(item.split(tagSeparator)[0]);
        }
        //Otherwise it just creates the selections part of the URL
        else {
            returnObject.selectionURLPart += "/select/"+encodeURIComponent(item.split(tagSeparator)[0]) + "/%5B" + encodeURIComponent(item.split(tagSeparator)[1].replace(tagSeparator,";"))+"%5D";
            splitForBrackets = returnObject.selectionURLPart.split("%3B%3B%3B%3B");
            returnObject.selectionURLPart = splitForBrackets.join("%5D%3B%5B");
        }
    });
    return returnObject;
};

//Helper funciton for adding on a "qv-activate" event of button/link
var activateButtonEvent = function ($element,config,layout,url) {
    var encodedURL = encodeURIComponent(url);
    $("#generateDashboardLink" + layout.qInfo.qId).on('qv-activate', function () {
        var finalURL = (config.isSecure ? "https://" : "http://" ) + config.host + (config.port ? ":" + config.port : "" ) + "/" + layout.urlResolver + "?URL=" + url;

        //Changing the button's text temporarily to mark success
        document.getElementById('generateDashboardLink' + layout.qInfo.qId).innerHTML= "Redirecting to " + layout.documentName + " app...";
        //Waiting for 1.5 seconds and resetting the button's text so that users are not discouraged to make new selections and generate new links
        setTimeout(function(){
            document.getElementById('generateDashboardLink' + layout.qInfo.qId).innerHTML = layout.documentName;
        },1500);

        window.onbeforeunload = null;
        if(layout.sameOrNewTab){
            window.open(finalURL,'_newtab');
        }
        else{
            window.location = finalURL;
        }
        return false;
    });
    $("#generateDashboardLink" + layout.qInfo.qId).prop("disabled",false);
};