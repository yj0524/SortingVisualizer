import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, RotateCcw } from "lucide-react";

const DEFAULT_SIZE = 48;
const MIN_SIZE = 4;
const MAX_SIZE = 180;
const DEFAULT_DELAY = 25;
const MIN_DELAY = 1;
const MAX_DELAY = 150;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomArray(size) {
    return Array.from({ length: size }, () => Math.floor(Math.random() * 96) + 5);
}

function swap(arr, i, j) {
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
}

function isSorted(arr) {
    for (let i = 1; i < arr.length; i += 1) {
        if (arr[i - 1] > arr[i]) {
            return false;
        }
    }
    return true;
}

function createContext(values, controls) {
    return {
        values,
        compareCount: 0,
        swapCount: 0,
        writeCount: 0,
        active: new Set(),
        sorted: new Set(),
        aux: new Set(),
        controls,
    };
}

async function flush(ctx) {
    const { controls } = ctx;
    controls.setState({
        values: [...ctx.values],
        active: new Set(ctx.active),
        sorted: new Set(ctx.sorted),
        aux: new Set(ctx.aux),
        stats: {
            compares: ctx.compareCount,
            swaps: ctx.swapCount,
            writes: ctx.writeCount,
        },
    });
    if (controls.delay > 0) {
        await sleep(controls.delay);
    } else {
        await Promise.resolve();
    }
    if (controls.shouldStop()) {
        throw new Error("STOPPED");
    }
}

async function mark(ctx, indices = [], kind = "active") {
    ctx.active.clear();
    ctx.aux.clear();
    if (kind === "active") {
        indices.forEach((i) => ctx.active.add(i));
    }
    if (kind === "aux") {
        indices.forEach((i) => ctx.aux.add(i));
    }
    await flush(ctx);
}

async function compare(ctx, i, j) {
    ctx.compareCount += 1;
    ctx.active.clear();
    ctx.active.add(i);
    ctx.active.add(j);
    await flush(ctx);
    return ctx.values[i] - ctx.values[j];
}

async function writeValue(ctx, i, value, kind = "active") {
    ctx.writeCount += 1;
    ctx.values[i] = value;
    ctx.active.clear();
    ctx.aux.clear();
    if (kind === "active") {
        ctx.active.add(i);
    } else {
        ctx.aux.add(i);
    }
    await flush(ctx);
}

async function swapValue(ctx, i, j) {
    ctx.swapCount += 1;
    swap(ctx.values, i, j);
    ctx.active.clear();
    ctx.active.add(i);
    ctx.active.add(j);
    await flush(ctx);
}

async function finish(ctx) {
    ctx.active.clear();
    ctx.aux.clear();
    for (let i = 0; i < ctx.values.length; i += 1) {
        ctx.sorted.add(i);
        await flush(ctx);
    }
}

async function bubbleSort(ctx) {
    const n = ctx.values.length;
    for (let i = 0; i < n; i += 1) {
        let swapped = false;
        for (let j = 0; j < n - i - 1; j += 1) {
            if ((await compare(ctx, j, j + 1)) > 0) {
                await swapValue(ctx, j, j + 1);
                swapped = true;
            }
        }
        ctx.sorted.add(n - i - 1);
        await flush(ctx);
        if (!swapped) {
            break;
        }
    }
}

async function selectionSort(ctx) {
    const n = ctx.values.length;
    for (let i = 0; i < n; i += 1) {
        let minIdx = i;
        for (let j = i + 1; j < n; j += 1) {
            if ((await compare(ctx, minIdx, j)) > 0) {
                minIdx = j;
                await mark(ctx, [i, minIdx], "aux");
            }
        }
        if (minIdx !== i) {
            await swapValue(ctx, i, minIdx);
        }
        ctx.sorted.add(i);
        await flush(ctx);
    }
}

async function insertionSort(ctx) {
    for (let i = 1; i < ctx.values.length; i += 1) {
        let j = i;
        while (j > 0 && (await compare(ctx, j - 1, j)) > 0) {
            await swapValue(ctx, j - 1, j);
            j -= 1;
        }
    }
}

async function binaryInsertionSort(ctx) {
    for (let i = 1; i < ctx.values.length; i += 1) {
        const key = ctx.values[i];
        let left = 0;
        let right = i;
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            ctx.compareCount += 1;
            await mark(ctx, [mid, i]);
            if (ctx.values[mid] <= key) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        for (let j = i; j > left; j -= 1) {
            await writeValue(ctx, j, ctx.values[j - 1]);
        }
        await writeValue(ctx, left, key);
    }
}

async function shellSort(ctx) {
    const n = ctx.values.length;
    let gap = Math.floor(n / 2);
    while (gap > 0) {
        for (let i = gap; i < n; i += 1) {
            const temp = ctx.values[i];
            let j = i;
            while (j >= gap) {
                ctx.compareCount += 1;
                await mark(ctx, [j - gap, j]);
                if (ctx.values[j - gap] <= temp) {
                    break;
                }
                await writeValue(ctx, j, ctx.values[j - gap]);
                j -= gap;
            }
            await writeValue(ctx, j, temp);
        }
        gap = Math.floor(gap / 2);
    }
}

async function combSort(ctx) {
    const n = ctx.values.length;
    let gap = n;
    let swapped = true;
    while (gap !== 1 || swapped) {
        gap = Math.max(1, Math.floor((gap * 10) / 13));
        swapped = false;
        for (let i = 0; i + gap < n; i += 1) {
            if ((await compare(ctx, i, i + gap)) > 0) {
                await swapValue(ctx, i, i + gap);
                swapped = true;
            }
        }
    }
}

async function cocktailSort(ctx) {
    let start = 0;
    let end = ctx.values.length - 1;
    let swapped = true;
    while (swapped) {
        swapped = false;
        for (let i = start; i < end; i += 1) {
            if ((await compare(ctx, i, i + 1)) > 0) {
                await swapValue(ctx, i, i + 1);
                swapped = true;
            }
        }
        end -= 1;
        if (!swapped) {
            break;
        }
        swapped = false;
        for (let i = end; i > start; i -= 1) {
            if ((await compare(ctx, i - 1, i)) > 0) {
                await swapValue(ctx, i - 1, i);
                swapped = true;
            }
        }
        start += 1;
    }
}

async function gnomeSort(ctx) {
    let i = 1;
    while (i < ctx.values.length) {
        if (i === 0 || (await compare(ctx, i - 1, i)) <= 0) {
            i += 1;
        } else {
            await swapValue(ctx, i - 1, i);
            i -= 1;
        }
    }
}

async function oddEvenSort(ctx) {
    let sorted = false;
    while (!sorted) {
        sorted = true;
        for (let i = 1; i < ctx.values.length - 1; i += 2) {
            if ((await compare(ctx, i, i + 1)) > 0) {
                await swapValue(ctx, i, i + 1);
                sorted = false;
            }
        }
        for (let i = 0; i < ctx.values.length - 1; i += 2) {
            if ((await compare(ctx, i, i + 1)) > 0) {
                await swapValue(ctx, i, i + 1);
                sorted = false;
            }
        }
    }
}

async function cycleSort(ctx) {
    const n = ctx.values.length;
    for (let cycleStart = 0; cycleStart < n - 1; cycleStart += 1) {
        let item = ctx.values[cycleStart];
        let pos = cycleStart;
        for (let i = cycleStart + 1; i < n; i += 1) {
            ctx.compareCount += 1;
            await mark(ctx, [cycleStart, i]);
            if (ctx.values[i] < item) {
                pos += 1;
            }
        }
        if (pos === cycleStart) {
            continue;
        }
        while (item === ctx.values[pos]) {
            pos += 1;
        }
        [item, ctx.values[pos]] = [ctx.values[pos], item];
        ctx.writeCount += 1;
        await flush(ctx);
        while (pos !== cycleStart) {
            pos = cycleStart;
            for (let i = cycleStart + 1; i < n; i += 1) {
                ctx.compareCount += 1;
                await mark(ctx, [cycleStart, i]);
                if (ctx.values[i] < item) {
                    pos += 1;
                }
            }
            while (item === ctx.values[pos]) {
                pos += 1;
            }
            [item, ctx.values[pos]] = [ctx.values[pos], item];
            ctx.writeCount += 1;
            await flush(ctx);
        }
    }
}

async function pancakeSort(ctx) {
    async function flip(end) {
        let start = 0;
        while (start < end) {
            await swapValue(ctx, start, end);
            start += 1;
            end -= 1;
        }
    }
    for (let size = ctx.values.length; size > 1; size -= 1) {
        let maxIdx = 0;
        for (let i = 1; i < size; i += 1) {
            if ((await compare(ctx, maxIdx, i)) < 0) {
                maxIdx = i;
            }
        }
        if (maxIdx !== size - 1) {
            if (maxIdx > 0) {
                await flip(maxIdx);
            }
            await flip(size - 1);
        }
    }
}

async function stoogeSort(ctx) {
    async function sort(l, r) {
        if ((await compare(ctx, l, r)) > 0) {
            await swapValue(ctx, l, r);
        }
        if (r - l + 1 > 2) {
            const t = Math.floor((r - l + 1) / 3);
            await sort(l, r - t);
            await sort(l + t, r);
            await sort(l, r - t);
        }
    }
    await sort(0, ctx.values.length - 1);
}

async function quickSortLomuto(ctx) {
    async function partition(low, high) {
        const pivot = ctx.values[high];
        let i = low;
        for (let j = low; j < high; j += 1) {
            ctx.compareCount += 1;
            await mark(ctx, [j, high], "aux");
            if (ctx.values[j] < pivot) {
                await swapValue(ctx, i, j);
                i += 1;
            }
        }
        await swapValue(ctx, i, high);
        return i;
    }
    async function sort(low, high) {
        if (low < high) {
            const p = await partition(low, high);
            ctx.sorted.add(p);
            await sort(low, p - 1);
            await sort(p + 1, high);
        }
    }
    await sort(0, ctx.values.length - 1);
}

async function quickSortHoare(ctx) {
    async function partition(low, high) {
        const pivot = ctx.values[Math.floor((low + high) / 2)];
        let i = low - 1;
        let j = high + 1;
        while (true) {
            do {
                i += 1;
                ctx.compareCount += 1;
                await mark(ctx, [i], "active");
            } while (ctx.values[i] < pivot);
            do {
                j -= 1;
                ctx.compareCount += 1;
                await mark(ctx, [j], "aux");
            } while (ctx.values[j] > pivot);
            if (i >= j) {
                return j;
            }
            await swapValue(ctx, i, j);
        }
    }
    async function sort(low, high) {
        if (low < high) {
            const p = await partition(low, high);
            await sort(low, p);
            await sort(p + 1, high);
        }
    }
    await sort(0, ctx.values.length - 1);
}

async function mergeSort(ctx) {
    async function merge(left, mid, right) {
        const leftArr = ctx.values.slice(left, mid + 1);
        const rightArr = ctx.values.slice(mid + 1, right + 1);
        let i = 0;
        let j = 0;
        let k = left;
        while (i < leftArr.length && j < rightArr.length) {
            ctx.compareCount += 1;
            await mark(ctx, [left + i, mid + 1 + j], "aux");
            if (leftArr[i] <= rightArr[j]) {
                await writeValue(ctx, k, leftArr[i], "aux");
                i += 1;
            } else {
                await writeValue(ctx, k, rightArr[j], "aux");
                j += 1;
            }
            k += 1;
        }
        while (i < leftArr.length) {
            await writeValue(ctx, k, leftArr[i], "aux");
            i += 1;
            k += 1;
        }
        while (j < rightArr.length) {
            await writeValue(ctx, k, rightArr[j], "aux");
            j += 1;
            k += 1;
        }
    }
    async function sort(left, right) {
        if (left >= right) {
            return;
        }
        const mid = Math.floor((left + right) / 2);
        await sort(left, mid);
        await sort(mid + 1, right);
        await merge(left, mid, right);
    }
    await sort(0, ctx.values.length - 1);
}

async function bottomUpMergeSort(ctx) {
    const n = ctx.values.length;
    for (let width = 1; width < n; width *= 2) {
        for (let left = 0; left < n; left += 2 * width) {
            const mid = Math.min(left + width - 1, n - 1);
            const right = Math.min(left + 2 * width - 1, n - 1);
            if (mid >= right) {
                continue;
            }
            const temp = [];
            let i = left;
            let j = mid + 1;
            while (i <= mid && j <= right) {
                ctx.compareCount += 1;
                await mark(ctx, [i, j], "aux");
                if (ctx.values[i] <= ctx.values[j]) {
                    temp.push(ctx.values[i]);
                    i += 1;
                } else {
                    temp.push(ctx.values[j]);
                    j += 1;
                }
            }
            while (i <= mid) {
                temp.push(ctx.values[i]);
                i += 1;
            }
            while (j <= right) {
                temp.push(ctx.values[j]);
                j += 1;
            }
            for (let k = 0; k < temp.length; k += 1) {
                await writeValue(ctx, left + k, temp[k], "aux");
            }
        }
    }
}

async function heapSort(ctx) {
    const n = ctx.values.length;
    async function heapify(size, root) {
        let largest = root;
        const left = root * 2 + 1;
        const right = root * 2 + 2;
        if (left < size && (await compare(ctx, left, largest)) > 0) {
            largest = left;
        }
        if (right < size && (await compare(ctx, right, largest)) > 0) {
            largest = right;
        }
        if (largest !== root) {
            await swapValue(ctx, root, largest);
            await heapify(size, largest);
        }
    }
    for (let i = Math.floor(n / 2) - 1; i >= 0; i -= 1) {
        await heapify(n, i);
    }
    for (let i = n - 1; i > 0; i -= 1) {
        await swapValue(ctx, 0, i);
        ctx.sorted.add(i);
        await heapify(i, 0);
    }
}

async function minHeapSort(ctx) {
    const n = ctx.values.length;
    async function heapify(size, root) {
        let smallest = root;
        const left = root * 2 + 1;
        const right = root * 2 + 2;
        if (left < size && (await compare(ctx, left, smallest)) < 0) {
            smallest = left;
        }
        if (right < size && (await compare(ctx, right, smallest)) < 0) {
            smallest = right;
        }
        if (smallest !== root) {
            await swapValue(ctx, root, smallest);
            await heapify(size, smallest);
        }
    }
    for (let i = Math.floor(n / 2) - 1; i >= 0; i -= 1) {
        await heapify(n, i);
    }
    const output = [];
    for (let size = n; size > 0; size -= 1) {
        output.push(ctx.values[0]);
        await swapValue(ctx, 0, size - 1);
        await heapify(size - 1, 0);
    }
    output.reverse();
    for (let i = 0; i < n; i += 1) {
        await writeValue(ctx, i, output[i], "aux");
    }
}

async function countingSort(ctx) {
    const maxVal = Math.max(...ctx.values);
    const count = Array(maxVal + 1).fill(0);
    for (let i = 0; i < ctx.values.length; i += 1) {
        count[ctx.values[i]] += 1;
        await mark(ctx, [i], "aux");
    }
    let idx = 0;
    for (let value = 0; value < count.length; value += 1) {
        while (count[value] > 0) {
            await writeValue(ctx, idx, value, "aux");
            idx += 1;
            count[value] -= 1;
        }
    }
}

async function radixSortLSD(ctx) {
    const maxVal = Math.max(...ctx.values);
    for (let exp = 1; Math.floor(maxVal / exp) > 0; exp *= 10) {
        const output = Array(ctx.values.length).fill(0);
        const count = Array(10).fill(0);
        for (let i = 0; i < ctx.values.length; i += 1) {
            const digit = Math.floor(ctx.values[i] / exp) % 10;
            count[digit] += 1;
            await mark(ctx, [i], "aux");
        }
        for (let i = 1; i < 10; i += 1) {
            count[i] += count[i - 1];
        }
        for (let i = ctx.values.length - 1; i >= 0; i -= 1) {
            const digit = Math.floor(ctx.values[i] / exp) % 10;
            output[count[digit] - 1] = ctx.values[i];
            count[digit] -= 1;
        }
        for (let i = 0; i < output.length; i += 1) {
            await writeValue(ctx, i, output[i], "aux");
        }
    }
}

async function radixSortMSD(ctx) {
    async function sort(start, end, exp) {
        if (start >= end || exp === 0) {
            return;
        }
        const buckets = Array.from({ length: 10 }, () => []);
        for (let i = start; i <= end; i += 1) {
            const digit = Math.floor(ctx.values[i] / exp) % 10;
            buckets[digit].push(ctx.values[i]);
            await mark(ctx, [i], "aux");
        }
        let idx = start;
        const ranges = [];
        for (let d = 0; d < 10; d += 1) {
            const s = idx;
            for (const v of buckets[d]) {
                await writeValue(ctx, idx, v, "aux");
                idx += 1;
            }
            if (idx - 1 >= s) {
                ranges.push([s, idx - 1]);
            }
        }
        for (const [s, e] of ranges) {
            await sort(s, e, Math.floor(exp / 10));
        }
    }
    const maxVal = Math.max(...ctx.values);
    let exp = 1;
    while (Math.floor(maxVal / exp) >= 10) {
        exp *= 10;
    }
    await sort(0, ctx.values.length - 1, exp);
}

async function bucketSort(ctx) {
    const bucketCount = Math.max(5, Math.floor(Math.sqrt(ctx.values.length)));
    const maxVal = Math.max(...ctx.values);
    const buckets = Array.from({ length: bucketCount }, () => []);
    for (let i = 0; i < ctx.values.length; i += 1) {
        const idx = Math.min(bucketCount - 1, Math.floor((ctx.values[i] / (maxVal + 1)) * bucketCount));
        buckets[idx].push(ctx.values[i]);
        await mark(ctx, [i], "aux");
    }
    let writeIdx = 0;
    for (const bucket of buckets) {
        bucket.sort((a, b) => a - b);
        for (const value of bucket) {
            await writeValue(ctx, writeIdx, value, "aux");
            writeIdx += 1;
        }
    }
}

async function pigeonholeSort(ctx) {
    const minVal = Math.min(...ctx.values);
    const maxVal = Math.max(...ctx.values);
    const holes = Array(maxVal - minVal + 1).fill(0);
    for (let i = 0; i < ctx.values.length; i += 1) {
        holes[ctx.values[i] - minVal] += 1;
        await mark(ctx, [i], "aux");
    }
    let idx = 0;
    for (let i = 0; i < holes.length; i += 1) {
        while (holes[i] > 0) {
            await writeValue(ctx, idx, i + minVal, "aux");
            idx += 1;
            holes[i] -= 1;
        }
    }
}

async function beadSort(ctx) {
    const max = Math.max(...ctx.values);
    const beads = Array.from({ length: ctx.values.length }, () => Array(max).fill(0));
    for (let i = 0; i < ctx.values.length; i += 1) {
        for (let j = 0; j < ctx.values[i]; j += 1) {
            beads[i][j] = 1;
        }
        await mark(ctx, [i], "aux");
    }
    for (let j = 0; j < max; j += 1) {
        let sum = 0;
        for (let i = 0; i < ctx.values.length; i += 1) {
            sum += beads[i][j];
            beads[i][j] = 0;
        }
        for (let i = ctx.values.length - sum; i < ctx.values.length; i += 1) {
            beads[i][j] = 1;
        }
    }
    for (let i = 0; i < ctx.values.length; i += 1) {
        let count = 0;
        while (count < max && beads[i][count]) {
            count += 1;
        }
        await writeValue(ctx, i, count, "aux");
    }
}

async function timSortLike(ctx) {
    const RUN = 16;
    async function insertion(left, right) {
        for (let i = left + 1; i <= right; i += 1) {
            const temp = ctx.values[i];
            let j = i - 1;
            while (j >= left && ctx.values[j] > temp) {
                ctx.compareCount += 1;
                await mark(ctx, [j, i]);
                await writeValue(ctx, j + 1, ctx.values[j]);
                j -= 1;
            }
            await writeValue(ctx, j + 1, temp);
        }
    }
    async function merge(left, mid, right) {
        const leftArr = ctx.values.slice(left, mid + 1);
        const rightArr = ctx.values.slice(mid + 1, right + 1);
        let i = 0;
        let j = 0;
        let k = left;
        while (i < leftArr.length && j < rightArr.length) {
            ctx.compareCount += 1;
            await mark(ctx, [left + i, mid + 1 + j], "aux");
            if (leftArr[i] <= rightArr[j]) {
                await writeValue(ctx, k, leftArr[i], "aux");
                i += 1;
            } else {
                await writeValue(ctx, k, rightArr[j], "aux");
                j += 1;
            }
            k += 1;
        }
        while (i < leftArr.length) {
            await writeValue(ctx, k, leftArr[i], "aux");
            i += 1;
            k += 1;
        }
        while (j < rightArr.length) {
            await writeValue(ctx, k, rightArr[j], "aux");
            j += 1;
            k += 1;
        }
    }
    const n = ctx.values.length;
    for (let i = 0; i < n; i += RUN) {
        await insertion(i, Math.min(i + RUN - 1, n - 1));
    }
    for (let size = RUN; size < n; size *= 2) {
        for (let left = 0; left < n; left += 2 * size) {
            const mid = Math.min(left + size - 1, n - 1);
            const right = Math.min(left + 2 * size - 1, n - 1);
            if (mid < right) {
                await merge(left, mid, right);
            }
        }
    }
}

async function introSort(ctx) {
    async function heapify(start, size, root) {
        let largest = root;
        const left = 2 * root + 1;
        const right = 2 * root + 2;
        if (left < size) {
            ctx.compareCount += 1;
            await mark(ctx, [start + left, start + largest]);
            if (ctx.values[start + left] > ctx.values[start + largest]) {
                largest = left;
            }
        }
        if (right < size) {
            ctx.compareCount += 1;
            await mark(ctx, [start + right, start + largest]);
            if (ctx.values[start + right] > ctx.values[start + largest]) {
                largest = right;
            }
        }
        if (largest !== root) {
            await swapValue(ctx, start + root, start + largest);
            await heapify(start, size, largest);
        }
    }
    async function heapRange(start, end) {
        const size = end - start + 1;
        for (let i = Math.floor(size / 2) - 1; i >= 0; i -= 1) {
            await heapify(start, size, i);
        }
        for (let i = size - 1; i > 0; i -= 1) {
            await swapValue(ctx, start, start + i);
            await heapify(start, i, 0);
        }
    }
    async function insertionRange(start, end) {
        for (let i = start + 1; i <= end; i += 1) {
            let j = i;
            while (j > start && ctx.values[j - 1] > ctx.values[j]) {
                ctx.compareCount += 1;
                await mark(ctx, [j - 1, j]);
                await swapValue(ctx, j - 1, j);
                j -= 1;
            }
        }
    }
    async function partition(low, high) {
        const pivot = ctx.values[high];
        let i = low;
        for (let j = low; j < high; j += 1) {
            ctx.compareCount += 1;
            await mark(ctx, [j, high], "aux");
            if (ctx.values[j] < pivot) {
                await swapValue(ctx, i, j);
                i += 1;
            }
        }
        await swapValue(ctx, i, high);
        return i;
    }
    async function sort(low, high, depthLimit) {
        const size = high - low + 1;
        if (size <= 1) {
            return;
        }
        if (size < 16) {
            await insertionRange(low, high);
            return;
        }
        if (depthLimit === 0) {
            await heapRange(low, high);
            return;
        }
        const p = await partition(low, high);
        await sort(low, p - 1, depthLimit - 1);
        await sort(p + 1, high, depthLimit - 1);
    }
    const depth = Math.floor(Math.log2(ctx.values.length || 1)) * 2;
    await sort(0, ctx.values.length - 1, depth);
}

async function smoothSortLike(ctx) {
    await heapSort(ctx);
}

async function bitonicSort(ctx) {
    const originalLength = ctx.values.length;
    let power = 1;
    while (power < originalLength) {
        power *= 2;
    }
    const filler = Math.max(...ctx.values) + 1;
    while (ctx.values.length < power) {
        ctx.values.push(filler);
    }
    async function compareAndSwap(i, j, dir) {
        ctx.compareCount += 1;
        await mark(ctx, [i, j]);
        if ((dir && ctx.values[i] > ctx.values[j]) || (!dir && ctx.values[i] < ctx.values[j])) {
            await swapValue(ctx, i, j);
        }
    }
    async function bitonicMerge(low, cnt, dir) {
        if (cnt > 1) {
            const k = Math.floor(cnt / 2);
            for (let i = low; i < low + k; i += 1) {
                await compareAndSwap(i, i + k, dir);
            }
            await bitonicMerge(low, k, dir);
            await bitonicMerge(low + k, k, dir);
        }
    }
    async function sort(low, cnt, dir) {
        if (cnt > 1) {
            const k = Math.floor(cnt / 2);
            await sort(low, k, true);
            await sort(low + k, k, false);
            await bitonicMerge(low, cnt, dir);
        }
    }
    await sort(0, power, true);
    ctx.values = ctx.values.slice(0, originalLength);
    await flush(ctx);
}

async function bogoSort(ctx) {
    const limit = 5000;
    let tries = 0;
    while (!isSorted(ctx.values) && tries < limit) {
        for (let i = ctx.values.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            await swapValue(ctx, i, j);
        }
        tries += 1;
    }
    if (!isSorted(ctx.values)) {
        await insertionSort(ctx);
    }
}

async function bogobogoSort(ctx) {
    const limit = 5000;
    let tries = 0;
    async function isSortedPrefix(n) {
        for (let i = 1; i < n; i += 1) {
            if (ctx.values[i - 1] > ctx.values[i]) {
                return false;
            }
        }
        return true;
    }
    async function shuffle(n) {
        for (let i = n - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            await swapValue(ctx, i, j);
        }
    }
    async function bogobogo(n) {
        if (n <= 1) {
            return true;
        }
        while (tries < limit) {
            if (!(await bogobogo(n - 1))) {
                return false;
            }
            if (await isSortedPrefix(n)) {
                return true;
            }
            await shuffle(n);
            tries += 1;
        }
        return false;
    }
    await bogobogo(ctx.values.length);
    if (!isSorted(ctx.values)) {
        await insertionSort(ctx);
    }
}

const algorithms = [
    { key: "bubble", name: "Bubble Sort", koreanName: "버블 정렬", fn: bubbleSort, category: "교환" },
    { key: "selection", name: "Selection Sort", koreanName: "선택 정렬", fn: selectionSort, category: "선택" },
    { key: "insertion", name: "Insertion Sort", koreanName: "삽입 정렬", fn: insertionSort, category: "삽입" },
    { key: "binary-insertion", name: "Binary Insertion Sort", koreanName: "이진 삽입 정렬", fn: binaryInsertionSort, category: "삽입" },
    { key: "shell", name: "Shell Sort", koreanName: "셸 정렬", fn: shellSort, category: "삽입" },
    { key: "comb", name: "Comb Sort", koreanName: "빗질 정렬", fn: combSort, category: "교환" },
    { key: "cocktail", name: "Cocktail Sort", koreanName: "칵테일 정렬", fn: cocktailSort, category: "교환" },
    { key: "gnome", name: "Gnome Sort", koreanName: "그놈 정렬", fn: gnomeSort, category: "교환" },
    { key: "odd-even", name: "Odd-Even Sort", koreanName: "홀짝 정렬", fn: oddEvenSort, category: "교환" },
    { key: "cycle", name: "Cycle Sort", koreanName: "순환 정렬", fn: cycleSort, category: "선택" },
    { key: "pancake", name: "Pancake Sort", koreanName: "팬케이크 정렬", fn: pancakeSort, category: "기타" },
    { key: "stooge", name: "Stooge Sort", koreanName: "스투지 정렬", fn: stoogeSort, category: "기타" },
    { key: "quick-lomuto", name: "Quick Sort (Lomuto)", koreanName: "퀵 정렬 (로무토)", fn: quickSortLomuto, category: "분할 정복" },
    { key: "quick-hoare", name: "Quick Sort (Hoare)", koreanName: "퀵 정렬 (호어)", fn: quickSortHoare, category: "분할 정복" },
    { key: "merge", name: "Merge Sort", koreanName: "병합 정렬", fn: mergeSort, category: "분할 정복" },
    { key: "bottom-up-merge", name: "Bottom-Up Merge Sort", koreanName: "상향식 병합 정렬", fn: bottomUpMergeSort, category: "분할 정복" },
    { key: "heap", name: "Heap Sort", koreanName: "힙 정렬", fn: heapSort, category: "힙" },
    { key: "min-heap", name: "Min-Heap Sort", koreanName: "최소 힙 정렬", fn: minHeapSort, category: "힙" },
    { key: "counting", name: "Counting Sort", koreanName: "계수 정렬", fn: countingSort, category: "분포" },
    { key: "radix-lsd", name: "Radix Sort (LSD)", koreanName: "기수 정렬 (LSD)", fn: radixSortLSD, category: "분포" },
    { key: "radix-msd", name: "Radix Sort (MSD)", koreanName: "기수 정렬 (MSD)", fn: radixSortMSD, category: "분포" },
    { key: "bucket", name: "Bucket Sort", koreanName: "버킷 정렬", fn: bucketSort, category: "분포" },
    { key: "pigeonhole", name: "Pigeonhole Sort", koreanName: "비둘기집 정렬", fn: pigeonholeSort, category: "분포" },
    { key: "bead", name: "Bead Sort", koreanName: "비드 정렬", fn: beadSort, category: "분포" },
    { key: "tim", name: "TimSort-like", koreanName: "팀 정렬 계열", fn: timSortLike, category: "하이브리드" },
    { key: "intro", name: "IntroSort", koreanName: "인트로 정렬", fn: introSort, category: "하이브리드" },
    { key: "smooth", name: "SmoothSort-like", koreanName: "부드러운 정렬 계열", fn: smoothSortLike, category: "하이브리드" },
    { key: "bitonic", name: "Bitonic Sort", koreanName: "바이토닉 정렬", fn: bitonicSort, category: "병렬" },
    { key: "bogo", name: "Bogo Sort", koreanName: "보고 정렬", fn: bogoSort, category: "무작위" },
    { key: "bogobogo", name: "Bogobogo Sort", koreanName: "보고보고 정렬", fn: bogobogoSort, category: "무작위" }
];

export default function SortingVisualizer() {
    const [values, setValues] = useState(() => randomArray(DEFAULT_SIZE));
    const [size, setSize] = useState(DEFAULT_SIZE);
    const [delay, setDelay] = useState(DEFAULT_DELAY);
    const [selected, setSelected] = useState("quick-lomuto");
    const [isRunning, setIsRunning] = useState(false);
    const [active, setActive] = useState(new Set());
    const [sorted, setSorted] = useState(new Set());
    const [aux, setAux] = useState(new Set());
    const [stats, setStats] = useState({ compares: 0, swaps: 0, writes: 0 });
    const [elapsedMs, setElapsedMs] = useState(0);
    const stopRef = useRef(false);
    const startedAtRef = useRef(0);
    const animationFrameRef = useRef(null);

    const currentAlgorithm = useMemo(
        () => algorithms.find((item) => item.key === selected) ?? algorithms[0],
        [selected]
    );

    const groupedAlgorithms = useMemo(() => {
        const groups = {};
        for (const algorithm of algorithms) {
            if (!groups[algorithm.category]) {
                groups[algorithm.category] = [];
            }
            groups[algorithm.category].push(algorithm);
        }
        return groups;
    }, []);

    useEffect(() => {
        if (!isRunning) {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            return;
        }

        const tick = () => {
            setElapsedMs(performance.now() - startedAtRef.current);
            animationFrameRef.current = requestAnimationFrame(tick);
        };

        tick();

        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [isRunning]);

    function resetArray(nextSize = size) {
        stopRef.current = true;
        setIsRunning(false);
        startedAtRef.current = 0;
        setValues(randomArray(nextSize));
        setActive(new Set());
        setSorted(new Set());
        setAux(new Set());
        setStats({ compares: 0, swaps: 0, writes: 0 });
        setElapsedMs(0);
    }

    async function startSort() {
        if (isRunning) {
            return;
        }
        startedAtRef.current = performance.now();
        stopRef.current = false;
        setIsRunning(true);
        setActive(new Set());
        setSorted(new Set());
        setAux(new Set());
        setStats({ compares: 0, swaps: 0, writes: 0 });
        setElapsedMs(0);

        const working = [...values];
        const ctx = createContext(working, {
            delay,
            shouldStop: () => stopRef.current,
            setState: ({ values: nextValues, active: nextActive, sorted: nextSorted, aux: nextAux, stats: nextStats }) => {
                setValues(nextValues);
                setActive(nextActive);
                setSorted(nextSorted);
                setAux(nextAux);
                setStats(nextStats);
            },
        });

        try {
            await currentAlgorithm.fn(ctx);
            await finish(ctx);
            setValues([...ctx.values]);
        } catch (error) {
            if (error.message !== "STOPPED") {
                console.error(error);
            }
        } finally {
            setElapsedMs(performance.now() - startedAtRef.current);
            setIsRunning(false);
            stopRef.current = false;
        }
    }

    function stopSort() {
        stopRef.current = true;
        setIsRunning(false);
    }

    function speedUp() {
        setDelay((prev) => Math.max(MIN_DELAY, prev - 10));
    }

    function formatElapsedTime(ms) {
        if (ms < 1000) {
            return `${Math.round(ms)} ms`;
        }

        return `${(ms / 1000).toFixed(2)} s`;
    }

    const maxValue = Math.max(...values, 1);
    const progress = (sorted.size / Math.max(1, values.length)) * 100;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
            <div className="mx-auto max-w-7xl grid gap-6">
                <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                    <Card className="rounded-3xl border-slate-800 bg-slate-900 text-slate-50 shadow-2xl">
                        <CardHeader>
                            <CardTitle className="text-2xl font-bold">정렬 알고리즘 비주얼라이저</CardTitle>
                            <p className="text-sm text-slate-300 leading-6">총합 {algorithms.length}개의 알고리즘을 지원합니다.</p>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span>알고리즘 선택</span>
                                    <Badge variant="secondary" className="rounded-full">
                                        {currentAlgorithm.category}
                                    </Badge>
                                </div>
                                <Select value={selected} onValueChange={setSelected} disabled={isRunning}>
                                    <SelectTrigger className="bg-slate-950 border-slate-700">
                                        <SelectValue placeholder="알고리즘 선택" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-96">
                                        {Object.entries(groupedAlgorithms).map(([category, items]) => (
                                            <div key={category}>
                                                <div className="px-2 py-1 text-xs font-semibold text-slate-500">{category}</div>
                                                {items.map((algorithm) => (
                                                    <SelectItem key={algorithm.key} value={algorithm.key}>
                                                        <span className="flex items-center gap-2">
                                                            <span>{algorithm.name}</span>
                                                            <span className="text-xs text-slate-400">{algorithm.koreanName}</span>
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </div>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span>배열 크기</span>
                                    <span>{size}</span>
                                </div>
                                <Slider
                                    value={[size]}
                                    min={MIN_SIZE}
                                    max={MAX_SIZE}
                                    step={1}
                                    disabled={isRunning}
                                    onValueChange={(value) => {
                                        const next = value[0];
                                        setSize(next);
                                        resetArray(next);
                                    }}
                                />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span>딜레이</span>
                                    <span>{delay} ms</span>
                                </div>
                                <Slider
                                    value={[delay]}
                                    min={MIN_DELAY}
                                    max={MAX_DELAY}
                                    step={1}
                                    disabled={isRunning}
                                    onValueChange={(value) => setDelay(value[0])}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Button className="rounded-2xl" variant="secondary" onClick={startSort} disabled={isRunning}>
                                    <Play className="mr-2 h-4 w-4" /> 시작
                                </Button>
                                <Button className="rounded-2xl" variant="secondary" onClick={stopSort} disabled={!isRunning}>
                                    <Pause className="mr-2 h-4 w-4" /> 중지
                                </Button>
                                <Button className="rounded-2xl col-span-2" variant="secondary" onClick={() => resetArray(size)} disabled={isRunning}>
                                    <RotateCcw className="mr-2 h-4 w-4" /> 리셋
                                </Button>
                            </div>

                            <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                <div className="flex items-center justify-between text-sm text-slate-300">
                                    <span>진행도</span>
                                    <span>{progress.toFixed(0)}%</span>
                                </div>
                                <Progress value={progress} />
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div className="rounded-2xl bg-slate-900 p-3">
                                        <div className="text-slate-400">비교</div>
                                        <div className="text-lg font-semibold">{stats.compares}</div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-900 p-3">
                                        <div className="text-slate-400">교환</div>
                                        <div className="text-lg font-semibold">{stats.swaps}</div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-900 p-3">
                                        <div className="text-slate-400">쓰기</div>
                                        <div className="text-lg font-semibold">{stats.writes}</div>
                                    </div>
                                </div>
                                <div className="rounded-2xl bg-slate-900 p-3 text-sm">
                                    <div className="text-slate-400">실행 시간</div>
                                    <div className="text-lg font-semibold">{formatElapsedTime(elapsedMs)}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-3xl border-slate-800 bg-slate-900 text-slate-50 shadow-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between gap-2 text-xl">
                                <span className="flex flex-col">
                                    <span>{currentAlgorithm.name}</span>
                                    <span className="text-sm font-medium text-slate-400">{currentAlgorithm.koreanName}</span>
                                </span>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <Badge className="rounded-full bg-emerald-600">정렬 완료</Badge>
                                    <Badge className="rounded-full bg-rose-600">비교/교환</Badge>
                                    <Badge className="rounded-full bg-sky-600">보조 작업</Badge>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[70vh] w-full rounded-3xl border border-slate-800 bg-slate-950 p-4 flex items-end gap-[2px] overflow-hidden">
                                {values.map((value, index) => {
                                    let color = "bg-slate-400";
                                    if (sorted.has(index)) {
                                        color = "bg-emerald-500";
                                    } else if (active.has(index)) {
                                        color = "bg-rose-500";
                                    } else if (aux.has(index)) {
                                        color = "bg-sky-500";
                                    }

                                    return (
                                        <div
                                            key={`${index}-${value}`}
                                            className={`${color} rounded-t-md w-full`}
                                            style={{
                                                height: `${(value / maxValue) * 100}%`,
                                                minWidth: values.length > 120 ? "2px" : "4px",
                                            }}
                                            title={`${index}: ${value}`}
                                        />
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* <Card className="rounded-3xl border-slate-800 bg-slate-900 text-slate-50">
                    <CardHeader>
                        <CardTitle className="text-lg">포함된 알고리즘</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        {algorithms.map((algorithm, index) => (
                            <Badge
                                key={algorithm.key}
                                variant={algorithm.key === selected ? "default" : "secondary"}
                                className="rounded-full px-3 py-1"
                            >
                                {index + 1}. {algorithm.name}
                            </Badge>
                        ))}
                    </CardContent>
                </Card> */}
            </div>
        </div>
    );
}
