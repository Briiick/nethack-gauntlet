#include "hack.h"
#include <stdio.h>
int main(void) {
    int i;
    objects_globals_init();
    printf("[\n");
    for (i = 0; i < NUM_OBJECTS; i++) {
        const char *n = obj_descr[i].oc_name, *d = obj_descr[i].oc_descr;
        printf("%s{\"i\":%d,\"name\":\"%s\",\"descr\":\"%s\",\"cls\":%d,\"color\":%d,\"mat\":%d}\n", i ? "," : "", i,
               n ? n : "", d ? d : "", objects[i].oc_class, objects[i].oc_color, objects[i].oc_material);
    }
    printf("]\n");
    return 0;
}
