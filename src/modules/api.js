//  QUICK REFERENCES
/*
 TYPES
 RAML: https://github.com/raml-org/raml-spec/blob/master/versions/raml-10/raml-10.md/#raml-data-types
 parser: https://github.com/raml-org/raml-js-parser-2/blob/master/documentation/GettingStarted.md#types

 */

var raml = require('raml-1-parser');
var _ = require('lodash');
var hljs = require('highlight.js');
var chalk = require('chalk');
var markdown = require('markdown').markdown;

var ramlo = {};

function produceDescription(api) {
    var description = api.description && api.description();
    return description && markdown.toHTML(description.value());
    return '';  // @TODO: remove temporary workaround for 'TypeError: api.description is not a function'
}

function produceDocumentations(api) {
    var apiDocumentations = [];
    var ramlDocumentations = api.documentation();

    _.forEach(ramlDocumentations, function (documentation) {
        var content = documentation.content();

        apiDocumentations.push({
            title: documentation.title(),
            content: content && markdown.toHTML(content.value())
        });
    });

    return apiDocumentations;
}

function produceResources(api) {
    var apiResources = [];
    var ramlResources = api.resources();

    var types = produceArrayOfUsesTypes(api);

    var namesArr = [];

    _.forEach(ramlResources, function (resource) {
        var uri = resource.completeRelativeUri();
        var name = resource.displayName() || capitalizeFirstLetter(uri.replace('/', ''));
        var description = '';
        var annotations = produceAnnotations(resource);
        var type = '';

        if (resource.description()) {
            description = resource.description().value();
        }

        //make sure there are no duplicates
        if (namesArr.indexOf(name) < 0) {

            namesArr.push(name);

            apiResources.push({
                uri: uri,
                name: name,
                description: description,
                type: type,
                endpoints: _.flattenDeep(produceEndpoints(resource, types)),
                annotations: annotations
            });
        }
    });

    return apiResources;
}

function produceEndpoints(resource, types) {
  var endpoints = [];
  var ramlNestedResources = resource.resources();
  var ramlMethods = resource.methods();

  _.forEach(ramlMethods, function (method) {
      var description = method.description() && markdown.toHTML(method.description().value());

      var securedBy = method.securedBy() || '';

      var annotations = produceAnnotations(method);

      //console.log( 'securedBy ' + securedBy );

      console.log('URI', resource.completeRelativeUri(), method.method());

      endpoints.push({
          uri: resource.completeRelativeUri(),
          method: method.method(),
          securedBy: securedBy,
          description: description,
          uriParameters: produceUriParameters(resource),
          queryParameters: produceQueryParameters(method),
          requestBody: produceRequestBody(method, types),
          responseBody: produceResponseBody(method),
          responseExample: produceResponseExample(method),
          annotations: annotations
      });
  });

  if (ramlNestedResources.length) {
      _.forEach(ramlNestedResources, function (resource) {
          endpoints.push(produceEndpoints(resource, types));
      });
  }

  return endpoints;
}

function produceUriParameters(resource) {
    var apiUriParameters = {
        /* default values */
        thead: {
            name: false,
            type: false,
            description: false
        },
        tbody: []
    };
    var ramlUriParameters = resource.uriParameters();

    _.forEach(ramlUriParameters, function (parameter) {
        var description = parameter.description();

        //check if type exists
        if (apiUriParameters.thead.type == false && parameter.type() != null) {
            apiUriParameters.thead.type = true;
        }

        //check if description exists
        if (apiUriParameters.thead.description == false && description != null) {
            apiUriParameters.thead.description = true;
        }

        //check if example exists
        if (apiUriParameters.thead.name == false && parameter.name() != null) {
            apiUriParameters.thead.name = true;
        }

        apiUriParameters['tbody'].push({
            name: parameter.name(),
            type: parameter.type(),
            description: description && markdown.toHTML(description.value())
        });
    });

    return apiUriParameters;
}

function produceQueryParameters(method) {
    var apiQueryParameters = {
        /* default values */
        thead: {
            name: false,
            type: false,
            description: false,
            example: false,
            default: false,
            minLength: false,
            maxLength: false
        },
        tbody: []
    };
    var ramlQueryParameters = method.queryParameters();

    _.forEach(ramlQueryParameters, function (parameter) {
        var description = parameter.description();
        var minLength = '';
        var maxLength = '';
        var repeat;

        //check if name exists
        if (apiQueryParameters.thead.name == false && parameter.name() != null) {
            apiQueryParameters.thead.name = true;
        }

        //check if type exists
        if (apiQueryParameters.thead.type == false && parameter.type() != null) {
            apiQueryParameters.thead.type = true;
        }

        //check if description exists
        if (apiQueryParameters.thead.description == false && description != null) {
            apiQueryParameters.thead.description = true;
        }

        //check if example exists
        if (apiQueryParameters.thead.example == false && parameter.example() != null) {
            apiQueryParameters.thead.example = true;
        }

        //check if default exists
        if (apiQueryParameters.thead.default == false && parameter.default() != null) {
            apiQueryParameters.thead.default = true;
        }

        try {
            /* note: parameter.minLength() & parameter.maxLength() throws an error if no minLength | maxLength exists
             it is an error from the parser, try...catch solves the problem
             */
            if (apiQueryParameters.thead.minLength == false && parameter.minLength() != null) {
                apiQueryParameters.thead.minLength = true;
                minLength = parameter.minLength();
            }
        }
        catch (err) {
        }

        try {
            if (apiQueryParameters.thead.maxLength == false && parameter.maxLength() != null) {
                apiQueryParameters.thead.maxLength = true;
                maxLength = parameter.maxLength();
            }
        }
        catch (err) {
        }

        if (parameter.repeat && _.isFunction(parameter.repeat)) {
            repeat = parameter.repeat();
        }

        apiQueryParameters['tbody'].push({
            name: parameter.name(),
            type: parameter.type(),
            isRequired: parameter.required(),
            description: description && markdown.toHTML(description.value()),
            example: parameter.example(),
            default: parameter.default(),
            minLength: minLength,
            maxLength: maxLength,
            repeat: repeat
        });
    });

    return apiQueryParameters;
}

function produceRequestBody(method, types) {
    var apiBodySchema = {
        thead: {},
        tbody: []
    };

    var ramlBody = method.body();

    if (Object.keys(ramlBody).length > 0) {
        if (_.isFunction(ramlBody.schemaContent)) {
          //expecting only 1 value to be valid
          //there should NOT be 2 or more 'body' declarations

          _.forEach(ramlBody, function (body) {

              if (body.schemaContent() != null) {
                  var sp = produceSchemaParameters(body.schemaContent());

                  //make sure that 'body' key was valid
                  if (sp['tbody'].length > 0) {
                      apiBodySchema = sp;
                  }
              }
          });
        } else {
          _.forEach(ramlBody, function (body) {
            if ( (_.isFunction(body.type) && body.type()) && (!_.isFunction(body.properties) || body.properties().length == 0) ) {
              _.forEach(body.type(), function (bodyType) {
                var bodyTypes = bodyType.split('|');

                _.forEach(bodyTypes, function (type) {
                  // FIXME need to refactor to support more than one return
                  var sp = produceJSONObjectParameters(type.trim(), types);

                  //make sure that 'body' key was valid
                  if (sp['tbody'].length > 0) {
                      apiBodySchema = sp;
                  }
                });
              });
          } else if ( _.isFunction(body.properties) && body.properties() ) {
            var sp = produceBodyPropertiesParameters(body.properties());

            //make sure that 'body' key was valid
            if (sp['tbody'].length > 0) {
                apiBodySchema = sp;
            }
          }
        });
      }
    }

    return apiBodySchema;
}

function produceResponseBody(method) {
    var ramlResponses = method.responses();
    var ramlBodies;
    var schemaProperties = [];

    _.forEach(ramlResponses, function (response) {

        if (response.code().value() === '200') {
            ramlBodies = response.body();

            _.forEach(ramlBodies, function (body) {
                if (!_.isFunction(body.schemaContent)) {
                    return;
                }

                //check if NULL before calling produceSchemaParameters()
                var sch = body.schemaContent();

                if (sch != null && typeof sch != 'undefined') {

                    var sp = produceSchemaParameters(sch);

                    if (sp['tbody'].length > 0) {
                        schemaProperties = sp;
                    }
                }

                //get
                try {
                    var type = body.toJSON();

                    //this key is inserted by json parser, we don't need it
                    if (type['__METADATA__'] != null) {
                        delete type['__METADATA__'];
                    }

                    schemaProperties['type'] = type;

                }
                catch (err) {
                    //console.log(err);
                }
            });
        }
    });

    return schemaProperties;
}

function produceResponseExample(method) {
    var apiExample = {};
    var apiExamples = [];
    var ramlResponses = method.responses();
    var ramlBodies;

    _.forEach(ramlResponses, function (response) {
        if (response.code().value() !== undefined) {
            ramlBodies = response.body();

            description = (response.description() !== undefined && response.description() ? response.description().value() : '');

            if (ramlBodies && ramlBodies.length > 0) {
              _.forEach(ramlBodies, function (body) {
                  apiExample = {
                      code: response.code().value(),
                      description: description,
                      response: body.toJSON().example
                  };

                  if (apiExample.response !== undefined) {
                      apiExample.response = apiExample.response; //&& hljs.highlight('json', apiExample.response).value;
                  } else {
                    if (body.toJSON().examples !== undefined) {
                      // TODO need to iterate to all examples
                      var example = body.toJSON().examples[0];

                      if (example.structuredValue === undefined)  {
                          apiExample.response = body.toJSON().examples[0].value;
                      } else {
                          apiExample.response = body.toJSON().examples[0].structuredValue;
                      }
                    }
                  }

                  try {
                      apiExamples = apiExamples.concat(apiExample);
                  }
                  catch (err) {
                      console.log(err);
                  }
              });
            }   else    {
                try{
                  apiExample = {
                    code: response.code().value(),
                    description: description,
                    response: ''
                  };

                  apiExamples = apiExamples.concat(apiExample);
                }
                catch (err) {
                    console.log(err);
                }
            }
        }
    });

    if (apiExamples.length === 0) {
        return undefined;
    }
    else {
        return apiExamples;
    }
}

function produceJSONObjectParameters(type, types) {
  var schemaProperties = {
      thead: {
          name: true,
          required: false,
          type: false,
          description: false
      },
      tbody: []
  };

  var keys = type.split('.');

  if (keys.length == 2)  {
    var typeObject = keys[0];
    var key = keys[1];

    _.forEach(types[typeObject].types(), function(keyTypeObject) {
        if (keyTypeObject.name() == key)  {
          var properties = _.isObject(keyTypeObject) ? keyTypeObject : JSON.parse(keyTypeObject);

          _.forEach(keyTypeObject.type(), function(extendedType) {
            var tempType = typeObject + '.' + extendedType;

            var tempSchemaProperties = produceJSONObjectParameters(tempType, types);

            if (tempSchemaProperties['thead'].required) {
              schemaProperties['thead'].required = tempSchemaProperties['thead'].required;
            }

            if (tempSchemaProperties['thead'].type) {
              schemaProperties['thead'].type = tempSchemaProperties['thead'].type;
            }

            if (tempSchemaProperties['thead'].description) {
              schemaProperties['thead'].description = tempSchemaProperties['thead'].description;
            }

            schemaProperties['tbody'].push.apply(schemaProperties['tbody'], tempSchemaProperties['tbody']);
          });

          _.forEach(properties.properties(), function(property) {
            nestedProperties = [];

            if (_.isFunction(property.required) && property.required()) {
                schemaProperties.thead.required = true;
            }

            //check if description exists
            if (_.isFunction(property.description) && property.description()) {
                schemaProperties.thead.description = true;
            }

            if (_.isFunction(property.type) && property.type()) {
                schemaProperties.thead.type = true;
            }

            schemaProperties['tbody'].push({
                name: property.name(),
                type: property.type()[0],
                description: (property.description()) ? property.description().value() : '',
                isRequired: property.required(),
                nestedProperties: null
            });
          });
        }
    });
  }

  return schemaProperties;
}

function produceBodyPropertiesParameters(properties) {
    var schemaProperties = {
        thead: {
            name: true,
            required: false,
            type: false,
            description: false
        },
        tbody: []
    };

    _.forEach(properties, function(property)  {
      console.log('property', JSON.stringify(property))
      nestedProperties = [];

      if (_.isFunction(property.required) && property.required()) {
          schemaProperties.thead.required = true;
      }

      //check if description exists
      if (_.isFunction(property.description) && property.description()) {
          schemaProperties.thead.description = true;
      }

      if (_.isFunction(property.type) && property.type()) {
          schemaProperties.thead.type = true;
      }

      schemaProperties['tbody'].push({
          name: property.name(),
          type: property.type()[0],
          description: (property.description()) ? property.description().value() : '',
          isRequired: property.required(),
          nestedProperties: null
      });
    });

    return schemaProperties;
}

function produceSchemaParameters(schemaContent) {

    var schemaProperties = {
        thead: {
            name: true,
            required: false,
            type: false,
            description: false
        },
        tbody: []
    };

    //before calling JSON.parse, make sure the string is valid json
    //using try/catch solved errors, ex. https://github.com/raml-apis/Instagram
    try {
        var schemaObject = _.isObject(schemaContent) ? schemaContent : JSON.parse(schemaContent);
        var nestedProperties;

        if (_.has(schemaObject, 'items')) {
            schemaObject = schemaObject.items;
        }

        if (_.has(schemaObject, 'properties')) {
            _.forOwn(schemaObject.properties, function (value, key) {
                nestedProperties = [];

                if (_.has(value, 'items')) {
                    value = value.items;
                }

                if (_.has(value, 'properties')) {
                    nestedProperties = produceSchemaParameters(value);
                }

                if (_.has(value, 'required')) {
                    //check if description exists
                    if (schemaProperties.thead.description == false && value.description != null) {
                        schemaProperties.thead.required = true;
                    }
                }

                //check if description exists
                if (schemaProperties.thead.description == false && value.description != null) {
                    schemaProperties.thead.description = true;
                }

                if (schemaProperties.thead.type == false && value.type != null) {
                    schemaProperties.thead.type = true;
                }

                schemaProperties['tbody'].push({
                    name: key,
                    type: value.type,
                    description: value.description,
                    isRequired: value.required,
                    nestedProperties: nestedProperties
                });
            });
        }
    }
    catch (err) {
        //console.log(err, schemaContent);
        //console.log('////////////////////////////////////////////////////');
    }

    return schemaProperties;
}

function capitalizeFirstLetter(string) {
    return string[0].toUpperCase() + string.slice(1);
}

function produceSecuredBy(api) {

    var securedBy = {};

    var secured = {};

    try {
        securedBy = api.securedBy();

        securedBy.name = securedBy[0].securitySchemeName();

        var scsh = api.securitySchemes();

        _.forOwn(scsh, function (val, key) {

            if (val.name() == securedBy.name) {

                secured = val.toJSON();

                //console.log(secured.describedBy.queryParameters.access_token);
            }

        });
    }
    catch (err) {
        //console.log(err);
    }
    return secured;
}

function produceProtocols(api) {

    var protocols = ' ';
    var protArr = [];
    try {
        protocols = api.protocols();

        _.forEach(protocols, function (p) {
            protArr.push(p);
        });

        protocols = 'Protocols: ' + protArr.join(', ');
    }
    catch (err) {
        //console.log( err );
    }
    return protocols;
}

function produceBaseUriParameters(api) {
    var baseUriParameters = [];
    try {
        var u = api.baseUriParameters();

        // Let's enumerate all URI parameters
        _.forOwn(u, function (parameter) {

            //api.baseUriParameters() function returns also 'version'
            // which can be retrieved from api.version()
            if (parameter.name() != 'version') {
                try {
                    baseUriParameters.push(parameter.toJSON());
                }
                catch (err) {
                }
            }
        });
    }
    catch (err) {
        //console.log(err);
    }
    return baseUriParameters;
}

function produceAllSecuritySchemes(api) {

    var securitySchemes = [];

    try {

        var scsh = api.securitySchemes();

        _.forOwn(scsh, function (val, key) {

            /*
             //data in responses could be organized better to be more dynamic
             //to be checked later on
             if(val.describedBy != null){
             if(val.describedBy.responses != null){
             console.log( produceSchemaParameters(val.describedBy.responses) )
             }
             }*/
            securitySchemes.push(val.toJSON());
        });
    }
    catch (err) {
        //console.log(err);
    }
    return securitySchemes;

}

function getAllResourceTypes(api) {
    try {
        api.resourceTypes().forEach(function (resourceType) {
            console.log(resourceType.name());

            resourceType.methods().forEach(function (method) {
                console.log('\t' + method.method());

                method.responses().forEach(function (response) {
                    console.log('\t\t' + response.code().value());
                });
            });
        });
    }
    catch (e) {
        console.log(e);
    }
}

function printHierarchy(runtimeType, indent) {
    indent = indent || '';
    var typeName = runtimeType.nameId();
    console.log(indent + typeName);
    runtimeType.superTypes().forEach(function (st) {
        printHierarchy(st, indent + '  ');
    });
}

function produceAnnotations(method) {

    var annotations = [];

    try {
        method.annotations().forEach(function (aRef) {

            var a = {};

            var name = aRef.name();
            var structure = aRef.structuredValue().toJSON();

            //forEach
            a[name] = {
                'value': structure
            };

            try {
                a[name].type = aRef.type();
            }
            catch (err) {
            }

            annotations.push(a);
        });
    }
    catch (err) {
    }

    return annotations;
}

function prepareSchemas(_schemas) {

    var schemas = [];

    _.forOwn(_schemas, function (value, key) {
        _.forOwn(value, function (schema, k) {

            var ob = {};

            var sch = JSON.parse(schema);

            ob[k] = sch;

            schemas.push(ob);
        });
    });

    return schemas;
}

function produceArrayOfCustomTypes(types) {

    var arr = [];

    _.forEach(types, function (obj) {
        _.forOwn(obj, function (val, key) {
            arr.push(key);
        });
    });

    return arr;
}

function produceArrayOfUsesTypes(api)  {
  var uses = {};

  var isFragment = raml.isFragment(api);

  api.uses().forEach(function(use){
    var useAst = use.ast();

    uses[use.key()] = useAst;
  });

  return uses;
}

///////////

module.exports = function (ramlFile) {
    var api;
    var apiBaseUri = '';
    var baseUriParameters = [];
    var types = [];
    var resourceTypes = '';
    var json = {};
    var schemas = [];
    var typeNamesArray = [];

    try {
        api = raml.loadApiSync(ramlFile).expand(); //expand() fixed the problem with traits

        json = api.toJSON();
    }
    catch (e) {
        console.log(chalk.red('provided file is not a correct RAML file!'));
        process.exit(1);
    }

    try {
        apiBaseUri = api.baseUri().value().replace('{version}', api.version());
    }
    catch (err) {
        //console.log('BaseUri' + err);
    }

    // https://github.com/raml-org/raml-spec/blob/master/versions/raml-10/raml-10.md/#overview
    if (json.types != null && typeof json.types != 'undefined') { //faster than try...catch
        types = json.types;
        typeNamesArray = produceArrayOfCustomTypes(types);
    }

    if (json.schemas != null && typeof json.schemas != 'undefined') { //faster than try...catch
        schemas = json.schemas;

        schemas = prepareSchemas(schemas);
    }

    if (json.resourceTypes != null && typeof json.resourceTypes != 'undefined') { //faster than try...catch
        resourceTypes = json.resourceTypes;
    }

    if (json.uses != null && typeof json.uses != 'undefined') { //faster than try...catch
        uses = json.uses;
    }

    ramlo.ramlVersion = api.RAMLVersion();
    ramlo.apiTitle = api.title();
    ramlo.apiVersion = api.version();

    ramlo.apiProtocol = produceProtocols(api);
    ramlo.apiDescription = produceDescription(api);
    ramlo.apiSecuritySchemes = produceAllSecuritySchemes(api);
    ramlo.apiSecuredBy = produceSecuredBy(api); //work in progress
    ramlo.apiBaseUri = apiBaseUri;
    ramlo.baseUriParameters = produceBaseUriParameters(api);
    ramlo.apiDocumentations = produceDocumentations(api);
    ramlo.apiResources = produceResources(api);
    ramlo.apiAllTypes = types;
    ramlo.typeNamesArray = typeNamesArray;
    ramlo.apiAllSchemas = schemas;
    //ramlo.mediaType = api.mediaType(); // TODO RAML specification not covered: add the default mediaType property

    return ramlo;
};
