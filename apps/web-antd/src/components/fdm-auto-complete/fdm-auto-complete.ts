import { defineComponent, h, ref } from 'vue';

import { AutoComplete, Input } from 'ant-design-vue';
import { autoCompleteProps } from 'ant-design-vue/es/auto-complete';

const FdmAutoComplete = defineComponent({
  name: 'FdmAutoComplete',
  inheritAttrs: false,
  props: autoCompleteProps(),
  setup(props, { attrs, expose, slots }) {
    const innerRef = ref<{ blur?: () => void; focus?: () => void }>();

    expose({
      blur: () => innerRef.value?.blur?.(),
      focus: () => innerRef.value?.focus?.(),
    });

    return () => {
      // AntDV AutoComplete 总会注入 getInputElement；清空与占位逻辑必须放在实际 Input 上。
      const { allowClear, onClear, placeholder, ...restProps } = props;

      return h(
        AutoComplete,
        { ...restProps, ...attrs, ref: innerRef },
        {
          ...slots,
          default:
            slots.default ??
            (() =>
              h(Input, {
                allowClear,
                onChange: (event: Event) => {
                  if (event.type === 'click') {
                    onClear?.();
                  }
                },
                placeholder,
              })),
        },
      );
    };
  },
});

export default FdmAutoComplete;
