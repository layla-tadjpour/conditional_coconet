"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
/**
 * Implementation for [Coconet]{@link
 * https://ismir2017.smcnus.org/wp-content/uploads/2017/10/187_Paper.pdf%7D}
 * models.
 *
 * @license
 * Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
var tf = require("@tensorflow/tfjs-core");
var logging = require("../../core/logging");
var sequences = require("../../core/sequences");
var coconet_utils_1 = require("./coconet_utils");
var DEFAULT_SPEC = {
    useSoftmaxLoss: true,
    batchNormVarianceEpsilon: 1.0e-07,
    numInstruments: 2,
    numFilters: 64,
    numLayers: 10,
    numRegularConvLayers: 2,
    dilation: [
        [1, 1], [2, 2], [4, 4], [8, 8], [16, 16], [32, 32], [64, 32]
    ],
    // TODO: exp with this, should it be null?
    layers: null,
    interleaveSplitEveryNLayers: 2,
    numPointwiseSplits: 2
};
var ConvNet = /** @class */ (function () {
    function ConvNet(spec, vars) {
        this.residualPeriod = 2;
        this.outputForResidual = null;
        this.residualCounter = -1;
        // Save for disposal.
        this.rawVars = null;
        this.spec = spec;
        this.rawVars = vars;
    }
    ConvNet.prototype.dispose = function () {
        if (this.rawVars !== null) {
            tf.dispose(this.rawVars);
        }
        if (this.outputForResidual) {
            this.outputForResidual.dispose();
        }
    };
    ConvNet.prototype.predictFromPianoroll = function (pianoroll, masks) {
        var _this = this;
        return tf.tidy(function () {
            var featuremaps = _this.getConvnetInput(pianoroll, masks);
            var n = _this.spec.layers.length;
            for (var i = 0; i < n; i++) {
                _this.residualCounter += 1;
                _this.residualSave(featuremaps);
                var numPointwiseSplits = null;
                if (_this.spec.interleaveSplitEveryNLayers && i > 0 && i < n - 2 &&
                    i % (_this.spec.interleaveSplitEveryNLayers + 1) === 0) {
                    numPointwiseSplits = _this.spec.numPointwiseSplits;
                }
                featuremaps = _this.applyConvolution(featuremaps, _this.spec.layers[i], i, i >= _this.spec.numRegularConvLayers, numPointwiseSplits);
                featuremaps = _this.applyResidual(featuremaps, i === 0, i === n - 1, i);
                featuremaps = _this.applyActivation(featuremaps, _this.spec.layers[i], i);
                featuremaps = _this.applyPooling(featuremaps, _this.spec.layers[i], i);
            }
            return _this.computePredictions(featuremaps);
        });
    };
    ConvNet.prototype.computePredictions = function (logits) {
        if (this.spec.useSoftmaxLoss) {
            return logits.transpose([0, 1, 3, 2]).softmax().transpose([0, 1, 3, 2]);
        }
        return logits.sigmoid();
    };
    ConvNet.prototype.residualReset = function () {
        this.outputForResidual = null;
        this.residualCounter = 0;
    };
    ConvNet.prototype.residualSave = function (x) {
        if (this.residualCounter % this.residualPeriod === 1) {
            this.outputForResidual = x;
        }
    };
    ConvNet.prototype.applyResidual = function (x, isFirst, isLast, i) {
        if (this.outputForResidual == null) {
            return x;
        }
        if (this.outputForResidual
            .shape[this.outputForResidual.shape.length - 1] !==
            x.shape[x.shape.length - 1]) {
            this.residualReset();
            return x;
        }
        if (this.residualCounter % this.residualPeriod === 0) {
            if (!isFirst && !isLast) {
                x = x.add(this.outputForResidual);
            }
        }
        return x;
    };
    ConvNet.prototype.getVar = function (name, layerNum) {
        //edit for conditional_coconet
        //const varname = `model/conv${layerNum}/${name}`;
        var varname = "model/conv" + layerNum + "/Conv2D/" + name;
        return this.rawVars[varname];
    };
    ConvNet.prototype.getSepConvVar = function (name, layerNum) {
        var varname = "model/conv" + layerNum + "/SeparableConv2d/" + name;
        return this.rawVars[varname];
    };
    ConvNet.prototype.getPointwiseSplitVar = function (name, layerNum, splitNum) {
        // tslint:disable-next-line:max-line-length
        var varname = "model/conv" + layerNum + "/split_" + layerNum + "_" + splitNum + "/" + name;
        return this.rawVars[varname];
    };
    ConvNet.prototype.applyConvolution = function (x, layer, i, depthwise, numPointwiseSplits) {
        if (layer.filters == null) {
            return x;
        }
        var filterShape = layer.filters;
        var stride = layer.convStride || 1;
        var padding = layer.convPad ?
            layer.convPad.toLowerCase() :
            'same';
        var conv = null;
        if (depthwise) {
            var dWeights = this.getSepConvVar('depthwise_weights', i);
            if (!numPointwiseSplits) {
                var pWeights = this.getSepConvVar('pointwise_weights', i);
                var biases = this.getSepConvVar('biases', i);
                var sepConv = tf.separableConv2d(x, dWeights, pWeights, [stride, stride], padding, layer.dilation, 'NHWC');
                conv = sepConv.add(biases);
            }
            else {
                conv = tf.depthwiseConv2d(x, dWeights, [stride, stride], padding, 'NHWC', layer.dilation);
                var splits = tf.split(conv, numPointwiseSplits, conv.rank - 1);
                var pointwiseSplits = [];
                for (var splitIdx = 0; splitIdx < numPointwiseSplits; splitIdx++) {
                    var outputShape = filterShape[3] / numPointwiseSplits;
                    //edit for conditional_coconet: changed from kernel to this, there are alo, Tensordor/Const_2 and Tenordot/free
                    // with shape [3] and [1]!
                    var weights = this.getPointwiseSplitVar('Tensordot/Reshape_1', i, splitIdx);
                    var biases = this.getPointwiseSplitVar('bias', i, splitIdx);
                    var dot = tf.matMul(splits[splitIdx].reshape([-1, outputShape]), weights, false, false);
                    var bias = tf.add(dot, biases);
                    pointwiseSplits.push(bias.reshape([
                        splits[splitIdx].shape[0], splits[splitIdx].shape[1],
                        splits[splitIdx].shape[2], outputShape
                    ]));
                }
                conv = tf.concat(pointwiseSplits, conv.rank - 1);
            }
        }
        else {
            //Note: changed it from 'weights' for the first initial conv in json.
            var weights = this.getVar('merged_input', i);
            var stride_1 = layer.convStride || 1;
            var padding_1 = layer.convPad ?
                layer.convPad.toLowerCase() :
                'same';
            conv = tf.conv2d(x, weights, [stride_1, stride_1], padding_1, 'NHWC', [1, 1]);
        }
        /* tslint:disable */
        //Remove batch norm, no popmean and popvariance
        //return this.applyBatchnorm(conv as tf.Tensor4D, i) as tf.Tensor4D;
        return conv;
    };
    ConvNet.prototype.applyBatchnorm = function (x, i) {
        var _this = this;
        var gammas = this.getVar('gamma', i);
        var betas = this.getVar('beta', i);
        var mean = this.getVar('popmean', i);
        var variance = this.getVar('popvariance', i);
        if (coconet_utils_1.IS_IOS) {
            // iOS WebGL floats are 16-bit, and the variance is outside this range.
            // This loads the variance to 32-bit floats in JS to compute batchnorm.
            // This arraySync is OK because we don't use the variance anywhere,
            // so it doesn't actually get uploaded to the GPU, so we don't
            // continuously download it and upload it which is the problem with
            // dataSync.
            var v = variance.arraySync()[0][0][0];
            var stdevs = tf.tensor(v.map(function (x) { return Math.sqrt(x + _this.spec.batchNormVarianceEpsilon); }));
            return x.sub(mean).mul(gammas.div(stdevs)).add(betas);
        }
        return tf.batchNorm(x, tf.squeeze(mean), tf.squeeze(variance), tf.squeeze(betas), tf.squeeze(gammas), this.spec.batchNormVarianceEpsilon);
    };
    ConvNet.prototype.applyActivation = function (x, layer, i) {
        if (layer.activation === 'identity') {
            return x;
        }
        return x.relu();
    };
    ConvNet.prototype.applyPooling = function (x, layer, i) {
        if (layer.pooling == null) {
            return x;
        }
        var pooling = layer.pooling;
        var padding = layer.poolPad ?
            layer.poolPad.toLowerCase() :
            'same';
        return tf.maxPool(x, [pooling[0], pooling[1]], [pooling[0], pooling[1]], padding);
    };
    ConvNet.prototype.getConvnetInput = function (pianoroll, masks) {
        pianoroll = tf.scalar(1, 'float32').sub(masks).mul(pianoroll);
        masks = tf.scalar(1, 'float32').sub(masks);
        return pianoroll.concat(masks, 3);
    };
    return ConvNet;
}());
/**
 * Coconet model implementation in TensorflowJS.
 * Thanks to [James Wexler](https://github.com/jameswex) for the original
 * implementation.
 */
var Coconet = /** @class */ (function () {
    /**
     * `Coconet` constructor.
     *
     * @param checkpointURL Path to the checkpoint directory.
     */
    function Coconet(checkpointURL) {
        this.spec = null;
        this.initialized = false;
        this.checkpointURL = checkpointURL;
        this.spec = DEFAULT_SPEC;
    }
    /**
     * Loads variables from the checkpoint and instantiates the model.
     */
    Coconet.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime;
            var _this = this;
            return __generator(this, function (_a) {
                this.dispose();
                startTime = performance.now();
                this.instantiateFromSpec();
                //L: add a promise
                return [2 /*return*/, new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                        var vars;
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, fetch(this.checkpointURL + "/weights_manifest.json")
                                        .then(function (response) { return response.json(); })
                                        .then(function (manifest) {
                                        return tf.io.loadWeights(manifest, _this.checkpointURL);
                                    })];
                                case 1:
                                    vars = _a.sent();
                                    this.convnet = new ConvNet(this.spec, vars);
                                    this.initialized = true;
                                    logging.logWithDuration('Initialized model', startTime, 'Coconet');
                                    if (this.initialized) {
                                        resolve("'Initialized model'");
                                    }
                                    else {
                                        reject("model falied to initilize");
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            });
        });
    };
    Coconet.prototype.dispose = function () {
        if (this.convnet) {
            this.convnet.dispose();
        }
        this.initialized = false;
    };
    Coconet.prototype.isInitialized = function () {
        return this.initialized;
    };
    /**
     * Sets up layer configuration from params
     */
    Coconet.prototype.instantiateFromSpec = function () {
        // Outermost dimensions' sizes of the non-final layers in the network.
        var nonFinalLayerFilterOuterSizes = 3;
        // Outermost dimensions' sizes of the last two layers in the network.
        var finalTwoLayersFilterOuterSizes = 2;
        this.spec.layers = [];
        // Set-up filter size of first convolutional layer.
        this.spec.layers.push({
            filters: [
                nonFinalLayerFilterOuterSizes, nonFinalLayerFilterOuterSizes,
                this.spec.numInstruments * 2, this.spec.numFilters
            ]
        });
        // Set-up filter sizes of middle convolutional layers.
        for (var i = 0; i < this.spec.numLayers - 3; i++) {
            this.spec.layers.push({
                filters: [
                    nonFinalLayerFilterOuterSizes, nonFinalLayerFilterOuterSizes,
                    this.spec.numFilters, this.spec.numFilters
                ],
                dilation: this.spec.dilation ? this.spec.dilation[i] : null
            });
        }
        // Set-up filter size of penultimate convolutional layer.
        this.spec.layers.push({
            filters: [
                finalTwoLayersFilterOuterSizes, finalTwoLayersFilterOuterSizes,
                this.spec.numFilters, this.spec.numFilters
            ]
        });
        // Set-up filter size and activation of final convolutional layer.
        this.spec.layers.push({
            filters: [
                finalTwoLayersFilterOuterSizes, finalTwoLayersFilterOuterSizes,
                this.spec.numFilters, this.spec.numInstruments
            ],
            activation: 'identity'
        });
    };
    /**
     * Use the model to generate a Bach-style 4-part harmony, conditioned on an
     * input sequence. The notes in the input sequence should have the
     * `instrument` property set corresponding to which voice the note belongs to:
     * 0 for Soprano, 1 for Alto, 2 for Tenor and 3 for Bass.
     *
     * **Note**: regardless of the length of the notes in the original sequence,
     * all the notes in the generated sequence will be 1 step long. If you want
     * to clean up the sequence to consider consecutive notes for the same
     * pitch and instruments as "held", you can call `mergeHeldNotes` on the
     * result. This function will replace any of the existing voices with
     * the output of the model. If you want to restore any of the original voices,
     * you can call `replaceVoice` on the output, specifying which voice should be
     * restored.
     *
     * @param sequence The sequence to infill. Must be quantized.
     * @param config (Optional) Infill parameterers like temperature, the number
     * of sampling iterations, or masks.
     */
    Coconet.prototype.infill = function (sequence, config) {
        return __awaiter(this, void 0, void 0, function () {
            var numSteps, pianoroll, temperature, numIterations, outerMasks, samples, outputSequence;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        sequences.assertIsRelativeQuantizedSequence(sequence);
                        if (sequence.notes.length === 0) {
                            throw new Error("NoteSequence " + sequence.id + " does not have any notes to infill.");
                        }
                        numSteps = sequence.totalQuantizedSteps ||
                            sequence.notes[sequence.notes.length - 1].quantizedEndStep;
                        pianoroll = coconet_utils_1.sequenceToPianoroll(sequence, numSteps);
                        temperature = 0.99;
                        numIterations = 96;
                        if (config) {
                            numIterations = config.numIterations || numIterations;
                            temperature = config.temperature || temperature;
                            outerMasks =
                                this.getCompletionMaskFromInput(config.infillMask, pianoroll);
                        }
                        else {
                            outerMasks = this.getCompletionMask(pianoroll);
                        }
                        return [4 /*yield*/, this.run(pianoroll, numIterations, temperature, outerMasks)];
                    case 1:
                        samples = _a.sent();
                        outputSequence = coconet_utils_1.pianorollToSequence(samples, numSteps);
                        pianoroll.dispose();
                        samples.dispose();
                        outerMasks.dispose();
                        //  if (outputSequence) {
                        //   resolve(outputSequence); 
                        // }
                        //  else {
                        //    reject("output sequence is  null");
                        //  }
                        return [2 /*return*/, outputSequence];
                }
            });
        });
    };
    /**
     * Runs sampling on pianorolls.
     */
    Coconet.prototype.run = function (pianorolls, numSteps, temperature, outerMasks) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.gibbs(pianorolls, numSteps, temperature, outerMasks)];
            });
        });
    };
    Coconet.prototype.getCompletionMaskFromInput = function (masks, pianorolls) {
        if (!masks) {
            return this.getCompletionMask(pianorolls);
        }
        else {
            // Create a buffer to store the input.
            var buffer_1 = tf.buffer([pianorolls.shape[1], 4]);
            for (var i = 0; i < masks.length; i++) {
                buffer_1.set(1, masks[i].step, masks[i].voice);
            }
            // Expand that buffer to the right shape.
            return tf.tidy(function () {
                return buffer_1.toTensor()
                    .expandDims(1)
                    .tile([1, coconet_utils_1.NUM_PITCHES, 1])
                    .expandDims(0);
            });
        }
    };
    Coconet.prototype.getCompletionMask = function (pianorolls) {
        return tf.tidy(function () {
            var isEmpty = pianorolls.sum(2, true).equal(tf.scalar(0, 'float32'));
            // Explicit broadcasting.
            return tf.cast(isEmpty, 'float32').add(tf.zerosLike(pianorolls));
        });
    };
    Coconet.prototype.gibbs = function (pianorolls, numSteps, temperature, outerMasks) {
        return __awaiter(this, void 0, void 0, function () {
            var numStepsTensor, pianoroll, _loop_1, this_1, s;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        numStepsTensor = tf.scalar(numSteps, 'float32');
                        pianoroll = pianorolls.clone();
                        _loop_1 = function (s) {
                            var pm, innerMasks, predictions;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        pm = this_1.yaoSchedule(s, numStepsTensor);
                                        innerMasks = this_1.bernoulliMask(pianoroll.shape, pm, outerMasks);
                                        return [4 /*yield*/, tf.nextFrame()];
                                    case 1:
                                        _a.sent();
                                        predictions = tf.tidy(function () {
                                            return _this.convnet.predictFromPianoroll(pianoroll, innerMasks);
                                        });
                                        return [4 /*yield*/, tf.nextFrame()];
                                    case 2:
                                        _a.sent();
                                        pianoroll = tf.tidy(function () {
                                            var samples = _this.samplePredictions(predictions, temperature);
                                            var updatedPianorolls = tf.where(tf.cast(innerMasks, 'bool'), samples, pianoroll);
                                            pianoroll.dispose();
                                            predictions.dispose();
                                            innerMasks.dispose();
                                            pm.dispose();
                                            return updatedPianorolls;
                                        });
                                        return [4 /*yield*/, tf.nextFrame()];
                                    case 3:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        s = 0;
                        _a.label = 1;
                    case 1:
                        if (!(s < numSteps)) return [3 /*break*/, 4];
                        return [5 /*yield**/, _loop_1(s)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        s++;
                        return [3 /*break*/, 1];
                    case 4:
                        numStepsTensor.dispose();
                        return [2 /*return*/, pianoroll];
                }
            });
        });
    };
    Coconet.prototype.yaoSchedule = function (i, n) {
        return tf.tidy(function () {
            var pmin = tf.scalar(0.1, 'float32');
            var pmax = tf.scalar(0.9, 'float32');
            var alpha = tf.scalar(0.7, 'float32');
            var wat = pmax.sub(pmin).mul(tf.scalar(i, 'float32')).div(n);
            var secondArg = pmax.sub(wat).div(alpha);
            return pmin.reshape([1]).concat(secondArg.reshape([1])).max();
        });
    };
    Coconet.prototype.bernoulliMask = function (shape, pm, outerMasks) {
        return tf.tidy(function () {
            var bb = shape[0], tt = shape[1], pp = shape[2], ii = shape[3];
            var probs = tf.tile(tf.randomUniform([bb, tt, 1, ii], 0, 1, 'float32'), [1, 1, pp, 1]);
            var masks = probs.less(pm);
            return tf.cast(masks, 'float32').mul(outerMasks);
        });
    };
    Coconet.prototype.samplePredictions = function (predictions, temperature) {
        return tf.tidy(function () {
            predictions = tf.pow(predictions, tf.scalar(1 / temperature, 'float32'));
            var cmf = tf.cumsum(predictions, 2, false, false);
            var totalMasses = cmf.slice([0, 0, cmf.shape[2] - 1, 0], [cmf.shape[0], cmf.shape[1], 1, cmf.shape[3]]);
            var u = tf.randomUniform(totalMasses.shape, 0, 1, 'float32');
            var i = u.mul(totalMasses).less(cmf).argMax(2);
            return tf.oneHot(i.flatten(), predictions.shape[2], 1, 0)
                .reshape([
                predictions.shape[0], predictions.shape[1], predictions.shape[3],
                predictions.shape[2]
            ])
                .transpose([0, 1, 3, 2]);
        });
    };
    return Coconet;
}());
exports.Coconet = Coconet;
//L:
//export {CoconetConfig}
